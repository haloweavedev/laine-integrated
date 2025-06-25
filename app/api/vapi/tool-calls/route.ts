import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { matchAppointmentTypeIntent, generateAppointmentConfirmationMessage } from "@/lib/ai/appointmentMatcher";
import { normalizeDateWithAI, generateSlotResponseMessage } from "@/lib/ai/slotHelper";
import { getNexhealthAvailableSlots } from "@/lib/nexhealth";
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
  requestedDate?: string;
  normalizedDateForSlots?: string;
  timePreferenceForSlots?: string;
  slotsOfferedToPatient?: Array<{
    time: string;
    operatoryId?: number;
    providerId: number;
  }>;
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
        console.log(`[VAPI Tool Handler] findAppointmentType called with request: "${patientRequest}"`);
        
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
              keywords: true
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

              // Prepare conversation state for next tool
              const conversationState: ConversationState = {
                lastAppointmentTypeId: matchedAppointment.nexhealthAppointmentTypeId,
                lastAppointmentTypeName: matchedAppointment.name,
                lastAppointmentDuration: matchedAppointment.duration,
                practiceId: practiceId
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

              console.log(`[Tool Handler] Successfully found appointment type: ${matchedAppointment.name}. Sending to VAPI.`);

              // Update CallLog with successful appointment type identification (now it definitely exists)
              try {
                console.log(`[DB Log] Updating CallLog for vapiCallId: ${callId} with appointment type: ${matchedAppointment.name}`);
                await prisma.callLog.update({
                  where: { vapiCallId: callId },
                  data: {
                    lastAppointmentTypeId: matchedAppointment.nexhealthAppointmentTypeId,
                    lastAppointmentTypeName: matchedAppointment.name,
                    lastAppointmentDuration: matchedAppointment.duration,
                    detectedIntent: patientRequest,
                    callStatus: "APPOINTMENT_TYPE_IDENTIFIED",
                    updatedAt: new Date(),
                  }
                });
              } catch (error) {
                console.error(`[DB Log] Error updating CallLog:`, error);
                // Don't let CallLog errors stop the tool response
              }
            } else {
              // Defensive coding - this shouldn't happen if AI returns valid ID
              toolResponse = {
                toolCallId: toolId!,
                error: "Internal error: Matched ID not found in local list."
              };
              console.error(`[Tool Handler] Error: Matched ID ${matchedApptId} not found in dbAppointmentTypes.`);
            }
          } else {
            // No match found
            toolResponse = {
              toolCallId: toolId!,
              result: "Hmm, I'm not quite sure I have an exact match for that. Could you tell me a bit more about what you need, or perhaps rephrase your request?"
            };
            console.log(`[Tool Handler] No appointment type match found for query: "${patientRequest}".`);

            // Update CallLog for no match case (now it definitely exists)
            try {
              console.log(`[DB Log] Updating CallLog for vapiCallId: ${callId}, no appointment type match.`);
              await prisma.callLog.update({
                where: { vapiCallId: callId },
                data: {
                  detectedIntent: patientRequest,
                  callStatus: "APPOINTMENT_TYPE_NOT_FOUND",
                  updatedAt: new Date(),
                }
              });
            } catch (error) {
              console.error(`[DB Log] Error updating CallLog:`, error);
              // Don't let CallLog errors stop the tool response
            }
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
        const timePreference = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.timePreference as string : undefined;
        const conversationState = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.conversationState as string : undefined;
        
        console.log(`[VAPI Tool Handler] checkAvailableSlots called with date: "${requestedDate}", timePreference: "${timePreference}"`);
        
        try {
          if (!practiceId) {
            toolResponse = {
              toolCallId: toolId!,
              error: "Practice configuration not found."
            };
            break;
          }

          if (!requestedDate || !conversationState) {
            toolResponse = {
              toolCallId: toolId!,
              error: "Missing required parameters: requestedDate and conversationState."
            };
            break;
          }

          // Parse conversation state
          let parsedState: ConversationState;
          try {
            parsedState = JSON.parse(conversationState);
          } catch (e) {
            console.error(`[VAPI Tool Handler] Error parsing conversationState:`, e);
            toolResponse = {
              toolCallId: toolId!,
              error: "Invalid conversationState format."
            };
            break;
          }

          const { lastAppointmentTypeId, lastAppointmentTypeName, lastAppointmentDuration } = parsedState;
          
          if (!lastAppointmentTypeId || !lastAppointmentTypeName || !lastAppointmentDuration) {
            toolResponse = {
              toolCallId: toolId!,
              error: "Conversation state missing appointment type information."
            };
            break;
          }

          // Fetch practice details
          const practice = await prisma.practice.findUnique({
            where: { id: practiceId },
            select: {
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

          // Normalize the date using AI
          const normalizedDate = await normalizeDateWithAI(requestedDate, practice.timezone || 'America/Chicago');
          
          if (!normalizedDate) {
            toolResponse = {
              toolCallId: toolId!,
              error: `I couldn't understand the date "${requestedDate}". Could you please specify a clearer date?`
            };
            break;
          }

          // Fetch provider IDs for this appointment type
          const providerData = await prisma.providerAcceptedAppointmentType.findMany({
            where: {
              appointmentType: {
                nexhealthAppointmentTypeId: lastAppointmentTypeId,
                practiceId: practiceId
              },
              savedProvider: {
                isActive: true
              }
            },
            include: {
              savedProvider: {
                include: {
                  provider: true
                }
              }
            }
          });

          if (providerData.length === 0) {
            toolResponse = {
              toolCallId: toolId!,
              error: "No active providers are configured for this appointment type."
            };
            break;
          }

          const providerNexHealthIds = providerData.map(pd => pd.savedProvider.provider.nexhealthProviderId);
          console.log(`[VAPI Tool Handler] Found ${providerNexHealthIds.length} providers for appointment type`);

          // Call NexHealth API for slots
          const slotsData = await getNexhealthAvailableSlots(
            practice.nexhealthSubdomain,
            practice.nexhealthLocationId,
            normalizedDate,
            1, // Search 1 day for now
            providerNexHealthIds,
            lastAppointmentDuration
          );

          // Process and filter slots
          const allSlots: Array<{ time: string; operatoryId?: number; providerId: number }> = [];
          
          for (const slotGroup of slotsData) {
            for (const slot of slotGroup.slots) {
              allSlots.push({
                time: slot.time,
                operatoryId: slot.operatory_id,
                providerId: slotGroup.pid
              });
            }
          }

          // Filter slots for lunch break and time preferences
          const practiceTimezone = practice.timezone || 'America/Chicago';
          const filteredSlots: Array<{ time: string; operatoryId?: number; providerId: number }> = [];

          for (const slot of allSlots) {
            const slotDateTime = DateTime.fromISO(slot.time).setZone(practiceTimezone);
            const slotHour = slotDateTime.hour;
            const slotMinute = slotDateTime.minute;
            
            // Check for lunch break (1:00 PM - 2:00 PM)
            const slotStartTime = slotHour * 60 + slotMinute; // Convert to minutes since midnight
            const slotEndTime = slotStartTime + lastAppointmentDuration;
            const lunchStart = 13 * 60; // 1:00 PM in minutes
            const lunchEnd = 14 * 60; // 2:00 PM in minutes
            
            // Skip if slot starts during lunch or extends into lunch
            if ((slotStartTime >= lunchStart && slotStartTime < lunchEnd) || 
                (slotEndTime > lunchStart && slotEndTime <= lunchEnd) ||
                (slotStartTime < lunchStart && slotEndTime > lunchEnd)) {
              console.log(`[Slot Filter] Skipping slot ${slot.time} - conflicts with lunch break`);
              continue;
            }

            // Apply time preference filter if provided
            if (timePreference) {
              const preference = timePreference.toLowerCase();
              if (preference.includes('morning') && slotHour >= 12) {
                continue;
              }
              if (preference.includes('afternoon') && slotHour < 12) {
                continue;
              }
              // Add more time preference logic as needed
            }

            filteredSlots.push(slot);
          }

          // Format slots for presentation (limit to 3)
          const formattedSlots = filteredSlots.slice(0, 3).map(slot => {
            const slotDateTime = DateTime.fromISO(slot.time).setZone(practiceTimezone);
            return slotDateTime.toFormat('h:mm a'); // e.g., "9:00 AM"
          });

          // Generate spoken response using AI
          const messageForAssistant = await generateSlotResponseMessage(
            lastAppointmentTypeName,
            normalizedDate,
            formattedSlots,
            timePreference
          );

          // Prepare updated conversation state
          const updatedConversationState = {
            ...parsedState,
            requestedDate,
            normalizedDateForSlots: normalizedDate,
            timePreferenceForSlots: timePreference,
            slotsOfferedToPatient: filteredSlots.slice(0, 3).map((slot, index) => ({
              time: formattedSlots[index],
              operatoryId: slot.operatoryId,
              providerId: slot.providerId
            })),
            practiceId: practiceId
          };

          toolResponse = {
            toolCallId: toolId!,
            result: JSON.stringify({
              tool_output_data: {
                messageForAssistant: messageForAssistant
              },
              current_conversation_state_snapshot: JSON.stringify(updatedConversationState)
            })
          };

          console.log(`[VAPI Tool Handler] Successfully checked slots for ${lastAppointmentTypeName} on ${normalizedDate}. Found ${filteredSlots.length} available slots.`);

          // Update CallLog with basic status (detailed fields will be added later)
          try {
            await prisma.callLog.update({
              where: { vapiCallId: callId },
              data: {
                callStatus: "SLOTS_CHECKED",
                updatedAt: new Date(),
              }
            });
          } catch (error) {
            console.error(`[DB Log] Error updating CallLog for slot check:`, error);
          }

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