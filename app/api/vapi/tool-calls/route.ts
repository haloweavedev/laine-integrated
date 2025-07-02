import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { matchAppointmentTypeIntent, generateAppointmentConfirmationMessage } from "@/lib/ai/appointmentMatcher";
import { normalizeDateWithAI } from "@/lib/ai/slotHelper";
import { DateTime } from "luxon";
import type { 
  ServerMessageToolCallsPayload, 
  VapiToolResult,
  ServerMessageToolCallItem 
} from "@/types/vapi";

interface ConversationState {
  lastAppointmentTypeId: string;
  lastAppointmentTypeName: string;
  lastAppointmentDuration: number;
  practiceId?: string;
  patientStatus?: string;
  originalPatientRequestForType?: string;
  requestedDate?: string;
  normalizedDateForSlots?: string;
  timePreferenceForSlots?: string;
  slotsOfferedToPatient?: Array<{
    time: string;
    operatoryId?: number;
    providerId: number;
  }>;
  // New fields for immediate slot checking
  check_immediate_next_available?: boolean;
  immediate_check_performed?: boolean;
  spokenName?: string;
  foundSlots?: Array<{
    time: string;
    operatory_id?: number;
    providerId: number;
    locationId: number;
  }>;
  nextAvailableDate?: string;
}

export async function POST(request: NextRequest) {
  // Variables to track timing and state for ToolLog
  let startTime: number | undefined;
  let toolCallItem: ServerMessageToolCallItem | undefined;
  let callId: string | undefined;
  let practiceId: string | null = null;
  let toolResponse: VapiToolResult | undefined;
  let toolName: string | undefined;
  let toolArguments: Record<string, unknown> | string | undefined;
  let toolId: string | undefined;

  try {
    // Parse the JSON request body
    const body: ServerMessageToolCallsPayload = await request.json();
    console.log("[VAPI Tool Handler] Incoming tool call payload:", JSON.stringify(body, null, 2));

    // Extract tool call item from either toolCallList or toolCalls (both can be present in VAPI payload)
    toolCallItem = body.message.toolCallList?.[0] || body.message.toolCalls?.[0];
    callId = body.message.call.id;

    if (!toolCallItem) {
      console.error("[VAPI Tool Handler] No toolCallItem found in payload:", body.message);
      return NextResponse.json({ results: [{ toolCallId: "unknown", error: "Malformed tool call payload from VAPI." }] }, { status: 200 });
    }

    // Extract tool information from the correct nested structure
    toolId = toolCallItem.id; // This is VAPI's tool_call_id for the result object
    toolName = toolCallItem.function.name;
    toolArguments = toolCallItem.function.arguments;

    // Handle cases where arguments might be a stringified JSON
    if (typeof toolArguments === 'string') {
      try {
        toolArguments = JSON.parse(toolArguments);
        console.log(`[VAPI Tool Handler] Parsed stringified toolArguments for tool ${toolName}.`);
      } catch (e) {
        console.error(`[VAPI Tool Handler] Failed to parse tool arguments string for tool ${toolName}:`, toolArguments, e);
        // If arguments are critical and unparsable, return an error to VAPI
        return NextResponse.json({ results: [{ toolCallId: toolId, error: `Failed to parse arguments for tool ${toolName}.` }] }, { status: 200 });
      }
    }

    console.log(`[VAPI Tool Handler] Processing tool: ${toolName} (Tool Invocation ID: ${toolId}) for Call Session ID: ${callId}`);
    console.log(`[VAPI Tool Handler] Arguments:`, toolArguments);

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

    // --- FIX: Ensure CallLog exists BEFORE creating ToolLog ---
    // This prevents the foreign key constraint violation
    try {
      await prisma.callLog.upsert({
        where: { vapiCallId: callId },
        update: { updatedAt: new Date() }, // Just update timestamp if it exists
        create: {
          vapiCallId: callId,
          practiceId: practiceId || "unknown",
          callStatus: "TOOL_INTERACTION_STARTED",
          callTimestampStart: new Date(startTime),
          createdAt: new Date(startTime),
          updatedAt: new Date(startTime),
        },
      });
      console.log(`[DB Log] Ensured CallLog exists for vapiCallId: ${callId}`);
    } catch (dbError) {
      console.error(`[DB Log] Error upserting initial CallLog for ${callId}:`, dbError);
      // Continue processing, but logging will be affected
    }

    // Create initial ToolLog entry (now CallLog exists)
    try {
      console.log(`[DB Log] Attempting to create ToolLog for toolCallId: ${toolId}`);
      await prisma.toolLog.create({
        data: {
          practiceId: practiceId || "unknown", // Use unknown if practice not found
          vapiCallId: callId,
          toolName: toolName,
          toolCallId: toolId,
          arguments: JSON.stringify(toolArguments),
          success: false, // Default, will be updated later
          createdAt: new Date(startTime), // Use consistent start time
          updatedAt: new Date(startTime),
        }
      });
      console.log(`[DB Log] Created initial ToolLog for toolCallId: ${toolId}`);
    } catch (error) {
      console.error(`[DB Log] Error creating ToolLog:`, error);
      // Don't stop processing if ToolLog creation fails
    }

    // Process tool calls based on tool name
    switch (toolName) {
      case "findAppointmentType": {
        const patientRequest = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.patientRequest as string : undefined;
        const patientStatus = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.patientStatus as string : undefined;
        console.log(`[VAPI Tool Handler] findAppointmentType called with request: "${patientRequest}", patientStatus: "${patientStatus}"`);
        
        try {
          if (!practiceId) {
            toolResponse = {
              toolCallId: toolId!,
              error: "Practice configuration not found."
            };
            break;
          }

          if (!patientRequest) {
            toolResponse = {
              toolCallId: toolId!,
              error: "Missing patientRequest parameter."
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
              keywords: true,
              check_immediate_next_available: true,
              spokenName: true
            }
          });

          if (!dbAppointmentTypes || dbAppointmentTypes.length === 0) {
            toolResponse = {
              toolCallId: toolId!,
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
              keywords: at.keywords || "",
            }))
          );

          if (!matchedApptId) {
            console.log(`[VAPI Tool Handler] No appointment type matched for request: "${patientRequest}"`);

            // Generate and return the response
            toolResponse = {
              toolCallId: toolId!,
              result: "I understand you're looking for an appointment, but I couldn't determine the exact type of service you need. Could you please be more specific about what you'd like to schedule?"
            };

            // Record this negative outcome in the CallLog for analysis
            try {
              console.log(`[DB Log] Updating CallLog for no match found...`);
              await prisma.callLog.update({
                where: { vapiCallId: callId },
                data: {
                  callStatus: "NO_APPOINTMENT_TYPE_MATCH",
                  detectedIntent: "appointment_scheduling",
                  originalPatientRequestForType: patientRequest,
                  updatedAt: new Date(),
                }
              });
              console.log(`[DB Log] Successfully updated CallLog with NO_APPOINTMENT_TYPE_MATCH for vapiCallId: ${callId}`);
            } catch (error) {
              console.error(`[DB Log] Error updating CallLog for no match:`, error);
              // Don't let CallLog errors stop the tool response
            }
            break;
          }

          // Find the matched appointment type's details 
          const matchedAppointmentType = dbAppointmentTypes.find(at => 
            at.nexhealthAppointmentTypeId === matchedApptId
          );

          if (!matchedAppointmentType) {
            toolResponse = {
              toolCallId: toolId!,
              error: "Error retrieving appointment type details."
            };
            break;
          }

          // Generate natural confirmation message
          const generatedMessage = await generateAppointmentConfirmationMessage(
            patientRequest,
            matchedAppointmentType.name,
            matchedAppointmentType.duration
          );

          // Prepare conversation state for next tool
          const conversationState: ConversationState = {
            lastAppointmentTypeId: matchedAppointmentType.nexhealthAppointmentTypeId,
            lastAppointmentTypeName: matchedAppointmentType.name,
            lastAppointmentDuration: matchedAppointmentType.duration,
            practiceId: practiceId,
            patientStatus: patientStatus || 'unknown',
            originalPatientRequestForType: patientRequest,
            check_immediate_next_available: matchedAppointmentType.check_immediate_next_available || false,
            spokenName: matchedAppointmentType.spokenName || matchedAppointmentType.name
          };

          toolResponse = {
            toolCallId: toolId!,
            result: JSON.stringify({
              tool_output_data: {
                messageForAssistant: generatedMessage
              },
              current_conversation_state_snapshot: JSON.stringify(conversationState)
            })
          };

          console.log(`[Tool Handler] Successfully found appointment type: ${matchedAppointmentType.name}. Sending to VAPI.`);

          // Update CallLog with successful appointment type identification using new schema fields
          try {
            console.log(`[DB Log] Updating CallLog for vapiCallId: ${callId} with appointment type: ${matchedAppointmentType.name}`);
            await prisma.callLog.update({
              where: { vapiCallId: callId },
              data: {
                lastAppointmentTypeId: matchedAppointmentType.nexhealthAppointmentTypeId,
                lastAppointmentTypeName: matchedAppointmentType.name,
                lastAppointmentDuration: matchedAppointmentType.duration,
                detectedIntent: patientRequest,
                callStatus: "APPOINTMENT_TYPE_IDENTIFIED",
                patientStatus: patientStatus || 'unknown',
                originalPatientRequestForType: patientRequest,
                lastToolConversationState: JSON.stringify(conversationState),
                updatedAt: new Date(),
              }
            });
            console.log(`[DB Log] Successfully updated CallLog with appointment type and enhanced fields`);
          } catch (error) {
            console.error(`[DB Log] Error updating CallLog with appointment type:`, error);
            // Don't let CallLog errors stop the tool response
          }
        } catch (error) {
          console.error(`[VAPI Tool Handler] Error fetching appointment types:`, error);
          toolResponse = {
            toolCallId: toolId!,
            error: "Database error while fetching appointment types."
          };
        }
        break;
      }

      case "checkAvailableSlots": {
        const requestedDate = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.requestedDate as string : undefined;
        const conversationState = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.conversationState as string : undefined;
        
        console.log(`[VAPI Tool Handler] checkAvailableSlots called with requestedDate: "${requestedDate}"`);
        
        try {
          if (!practiceId) {
            toolResponse = {
              toolCallId: toolId!,
              error: "Practice configuration not found."
            };
            break;
          }

          if (!conversationState) {
            toolResponse = {
              toolCallId: toolId!,
              error: "Missing required parameter: conversationState."
            };
            break;
          }

          // Parse conversation state
          let parsedState: ConversationState;
          try {
            parsedState = JSON.parse(conversationState);
            console.log(`[VAPI Tool Handler] Parsed conversationState:`, parsedState);
          } catch (e) {
            console.error(`[VAPI Tool Handler] Error parsing conversationState:`, e);
            toolResponse = {
              toolCallId: toolId!,
              error: "Invalid conversationState format."
            };
            break;
          }

          // Fetch practice details
          const practice = await prisma.practice.findUnique({
            where: { id: practiceId },
            select: {
              id: true,
              timezone: true,
              nexhealthSubdomain: true,
              nexhealthLocationId: true,
            }
          });

          if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
            toolResponse = {
              toolCallId: toolId!,
              error: "Practice NexHealth configuration not found."
            };
            break;
          }

          let searchDate: string | null = null;

          // 1. PRIORITY 1: Handle explicit user date request
          if (requestedDate) {
            console.log(`[VAPI Tool Handler] User provided a specific date: "${requestedDate}". Normalizing...`);
            searchDate = await normalizeDateWithAI(requestedDate, practice.timezone || 'America/Chicago');
            if (!searchDate) {
              // Handle INVALID_DATE response from AI
              toolResponse = { toolCallId: toolId!, result: `I couldn't quite understand the date "${requestedDate}". Could you try saying it a different way?` };
              break; // Exit the switch case
            }
            console.log(`[VAPI Tool Handler] Normalized date to: ${searchDate}`);
          }

          // 2. PRIORITY 2: Handle immediate check if no date was given
          else if (parsedState.check_immediate_next_available && !parsedState.immediate_check_performed) {
            console.log(`[VAPI Tool Handler] No date provided. Performing immediate slot check.`);
            // For immediate check, the start date is today.
            searchDate = DateTime.now().setZone(practice.timezone || 'America/Chicago').toFormat('yyyy-MM-dd');
          }

          // 3. FALLBACK: If no date and not an immediate check, ask the user.
          else {
            toolResponse = { toolCallId: toolId!, result: "To find an appointment, what day and time would you be looking for?" };
            break;
          }

          // Now, perform the search using the determined searchDate
          const searchDays = (requestedDate) ? 1 : 3; // Search 1 day if specific, 3 if immediate
          
          // Import the refactored slot functions
          const { findAvailableSlots, generateSlotResponse } = await import("@/lib/ai/slotHelper");
          
          const searchResult = await findAvailableSlots(
            parsedState.lastAppointmentTypeId,
            {
              id: practice.id,
              nexhealthSubdomain: practice.nexhealthSubdomain!,
              nexhealthLocationId: practice.nexhealthLocationId!,
              timezone: practice.timezone || 'America/Chicago'
            },
            searchDate,
            searchDays
          );

          const spokenName = parsedState.spokenName || parsedState.lastAppointmentTypeName;
          const aiResponse = await generateSlotResponse(
            searchResult,
            spokenName,
            practice.timezone || 'America/Chicago'
          );

          // Update conversation state
          const updatedState: ConversationState = {
            ...parsedState,
            immediate_check_performed: true, // Mark as performed so it doesn't loop
            foundSlots: searchResult.foundSlots,
            nextAvailableDate: searchResult.nextAvailableDate || undefined,
            normalizedDateForSlots: searchDate,
          };

          toolResponse = {
            toolCallId: toolId!,
            result: JSON.stringify({
              tool_output_data: { messageForAssistant: aiResponse },
              current_conversation_state_snapshot: JSON.stringify(updatedState)
            })
          };

        } catch (error) {
          console.error(`[VAPI Tool Handler] Error checking available slots:`, error);
          toolResponse = {
            toolCallId: toolId!,
            error: "Error checking available appointment slots."
          };
        }
        break;
      }
      
      default: {
        console.error(`[VAPI Tool Handler] Unknown tool: ${toolName}`);
        toolResponse = {
          toolCallId: toolId!,
          error: `Unknown tool: ${toolName}`
        };
        break;
      }
    }

    console.log(`[VAPI Tool Handler] Tool response:`, toolResponse);
    return NextResponse.json({ results: [toolResponse] }, { status: 200 });

  } catch (error) {
    console.error("[VAPI Tool Handler] Error processing tool call:", error);
    
    // Set error response if not already set
    if (!toolResponse && toolCallItem) {
      toolResponse = {
        toolCallId: toolId!,
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
    if (toolCallItem && startTime !== undefined && toolResponse) {
      try {
        const executionTimeMs = Date.now() - startTime;
        console.log(`[DB Log] Attempting to update ToolLog for toolCallId: ${toolId} with success: ${!toolResponse.error}`);
        
        await prisma.toolLog.updateMany({
          where: { toolCallId: toolId! },
          data: {
            result: toolResponse.result || undefined, // Don't stringify, keep as string
            error: toolResponse.error || undefined,
            success: !toolResponse.error,
            executionTimeMs,
            updatedAt: new Date(),
          }
        });
        console.log(`[DB Log] Updated ToolLog for toolCallId: ${toolId} with success: ${!toolResponse.error}`);
      } catch (error) {
        console.error(`[DB Log] Error updating ToolLog:`, error);
      }
    }
  }
} 