import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { matchAppointmentTypeIntent, generateAppointmentConfirmationMessage } from "@/lib/ai/appointmentMatcher";
import type { 
  ServerMessageToolCallsPayload, 
  VapiToolResult,
  ServerMessageToolCallItem 
} from "@/types/vapi";

export async function POST(request: NextRequest) {
  // Variables to track timing and state for ToolLog
  let startTime: number | undefined;
  let toolCall: ServerMessageToolCallItem | undefined;
  let callId: string | undefined;
  let practiceId: string | null = null;
  let toolResponse: VapiToolResult | undefined;

  try {
    // Parse the JSON request body
    const body: ServerMessageToolCallsPayload = await request.json();
    console.log("[VAPI Tool Handler] Incoming tool call payload:", JSON.stringify(body, null, 2));

    // Extract tool call and call information
    toolCall = body.message.toolCallList[0];
    callId = body.message.call.id;

    if (!toolCall) {
      console.error("[VAPI Tool Handler] No tool call found in payload");
      return NextResponse.json(
        { error: "No tool call found in payload" }, 
        { status: 400 }
      );
    }

    console.log(`[VAPI Tool Handler] Processing tool: ${toolCall.name} for call: ${callId}`);

    // Start timing for ToolLog
    startTime = Date.now();

    // TODO: Dynamically determine practiceId for multi-tenancy
    // For now, fetch the first available practice for testing purposes
    const firstPractice = await prisma.practice.findFirst();
    
    if (!firstPractice) {
      practiceId = null; // Will be handled in ToolLog creation
    } else {
      practiceId = firstPractice.id;
    }

    // Create initial ToolLog entry
    try {
      console.log(`[DB Log] Attempting to create ToolLog for toolCallId: ${toolCall.id}`);
      await prisma.toolLog.create({
        data: {
          practiceId: practiceId || "unknown", // Use unknown if practice not found
          vapiCallId: callId,
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          arguments: JSON.stringify(toolCall.arguments),
          success: false, // Default, will be updated later
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      });
    } catch (error) {
      console.error(`[DB Log] Error creating ToolLog:`, error);
      // Don't stop processing if ToolLog creation fails
    }

    // Process tool calls based on tool name
    switch (toolCall.name) {
      case "findAppointmentType": {
        const patientRequest = toolCall.arguments.patientRequest as string;
        console.log(`[VAPI Tool Handler] findAppointmentType called with request: "${patientRequest}"`);
        
        try {
          if (!practiceId) {
            toolResponse = {
              toolCallId: toolCall.id,
              error: "Practice configuration not found."
            };
            break;
          }

          console.log(`[VAPI Tool Handler] Using practice: ${practiceId}`);

          // Fetch appointment types with keywords for this practice
          const dbAppointmentTypes = await prisma.appointmentType.findMany({
            where: {
              practiceId: practiceId,
              AND: [
                { keywords: { not: null } },
                { keywords: { not: "" } }
              ]
            },
            select: {
              nexhealthAppointmentTypeId: true,
              name: true,
              duration: true,
              keywords: true
            }
          });

          if (!dbAppointmentTypes || dbAppointmentTypes.length === 0) {
            toolResponse = {
              toolCallId: toolCall.id,
              error: "No suitable appointment types are configured for matching in this practice."
            };
            break;
          }

          console.log(`[VAPI Tool Handler] Found ${dbAppointmentTypes.length} appointment types with keywords`);

          // Use AI to match the patient request to appointment types
          const matchedApptId = await matchAppointmentTypeIntent(
            patientRequest,
            dbAppointmentTypes.map(at => ({
              id: at.nexhealthAppointmentTypeId,
              name: at.name,
              keywords: at.keywords,
            }))
          );

          if (matchedApptId) {
            // Find the full appointment details from the matched ID
            const matchedAppointment = dbAppointmentTypes.find(
              at => at.nexhealthAppointmentTypeId === matchedApptId
            );

            if (matchedAppointment) {
              // Generate natural confirmation message
              const generatedMessage = await generateAppointmentConfirmationMessage(
                patientRequest,
                matchedAppointment.name,
                matchedAppointment.duration
              );

              toolResponse = {
                toolCallId: toolCall.id,
                result: generatedMessage
              };

              console.log(`[Tool Handler] Successfully found appointment type: ${matchedAppointment.name}. Sending to VAPI.`);

              // Update CallLog with successful appointment type identification
              try {
                console.log(`[DB Log] Upserting CallLog for vapiCallId: ${callId} with appointment type: ${matchedAppointment.name}`);
                await prisma.callLog.upsert({
                  where: { vapiCallId: callId },
                  update: {
                    lastAppointmentTypeId: matchedAppointment.nexhealthAppointmentTypeId,
                    lastAppointmentTypeName: matchedAppointment.name,
                    lastAppointmentDuration: matchedAppointment.duration,
                    detectedIntent: patientRequest,
                    callStatus: "APPOINTMENT_TYPE_IDENTIFIED",
                    updatedAt: new Date(),
                  },
                  create: {
                    vapiCallId: callId,
                    practiceId: practiceId,
                    lastAppointmentTypeId: matchedAppointment.nexhealthAppointmentTypeId,
                    lastAppointmentTypeName: matchedAppointment.name,
                    lastAppointmentDuration: matchedAppointment.duration,
                    detectedIntent: patientRequest,
                    callStatus: "APPOINTMENT_TYPE_IDENTIFIED",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  }
                });
              } catch (error) {
                console.error(`[DB Log] Error upserting CallLog:`, error);
                // Don't let CallLog errors stop the tool response
              }
            } else {
              // Defensive coding - this shouldn't happen if AI returns valid ID
              toolResponse = {
                toolCallId: toolCall.id,
                error: "Internal error: Matched ID not found in local list."
              };
              console.error(`[Tool Handler] Error: Matched ID ${matchedApptId} not found in dbAppointmentTypes.`);
            }
          } else {
            // No match found
            toolResponse = {
              toolCallId: toolCall.id,
              result: "Hmm, I'm not quite sure I have an exact match for that. Could you tell me a bit more about what you need, or perhaps rephrase your request?"
            };
            console.log(`[Tool Handler] No appointment type match found for query: "${patientRequest}".`);

            // Update CallLog for no match case
            try {
              console.log(`[DB Log] Upserting CallLog for vapiCallId: ${callId}, no appointment type match.`);
              await prisma.callLog.upsert({
                where: { vapiCallId: callId },
                update: {
                  detectedIntent: patientRequest,
                  callStatus: "APPOINTMENT_TYPE_NOT_FOUND",
                  updatedAt: new Date(),
                },
                create: {
                  vapiCallId: callId,
                  practiceId: practiceId,
                  detectedIntent: patientRequest,
                  callStatus: "APPOINTMENT_TYPE_NOT_FOUND",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                }
              });
            } catch (error) {
              console.error(`[DB Log] Error upserting CallLog:`, error);
              // Don't let CallLog errors stop the tool response
            }
          }

        } catch (error) {
          console.error(`[VAPI Tool Handler] Error fetching appointment types:`, error);
          toolResponse = {
            toolCallId: toolCall.id,
            error: "Database error while fetching appointment types."
          };
        }
        break;
      }
      
      default: {
        console.error(`[VAPI Tool Handler] Unknown tool: ${toolCall.name}`);
        toolResponse = {
          toolCallId: toolCall.id,
          error: `Unknown tool: ${toolCall.name}`
        };
        break;
      }
    }

    console.log(`[VAPI Tool Handler] Tool response:`, toolResponse);
    return NextResponse.json({ results: [toolResponse] }, { status: 200 });

  } catch (error) {
    console.error("[VAPI Tool Handler] Error processing tool call:", error);
    
    // Set error response if not already set
    if (!toolResponse && toolCall) {
      toolResponse = {
        toolCallId: toolCall.id,
        error: "Internal server error processing tool call"
      };
    }
    
    return NextResponse.json(
      { 
        error: "Internal server error processing tool call",
        details: error instanceof Error ? error.message : "Unknown error"
      }, 
      { status: 500 }
    );
  } finally {
    // Update ToolLog with final outcome
    if (toolCall && startTime !== undefined && toolResponse) {
      try {
        const executionTimeMs = Date.now() - startTime;
        console.log(`[DB Log] Attempting to update ToolLog for toolCallId: ${toolCall.id} with success: ${!toolResponse.error}`);
        
        await prisma.toolLog.updateMany({
          where: { toolCallId: toolCall.id },
          data: {
            result: toolResponse.result ? JSON.stringify(toolResponse.result) : undefined,
            error: toolResponse.error || undefined,
            success: !toolResponse.error,
            executionTimeMs,
            updatedAt: new Date(),
          }
        });
      } catch (error) {
        console.error(`[DB Log] Error updating ToolLog:`, error);
      }
    }
  }
} 