import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { matchAppointmentTypeIntent, generateAppointmentConfirmationMessage } from "@/lib/ai/appointmentMatcher";
import { normalizeDateWithAI, generateSlotResponseMessage } from "@/lib/ai/slotHelper";
import { getNexhealthAvailableSlots } from "@/lib/nexhealth";
import { DateTime } from "luxon";
import { toZonedTime, format } from 'date-fns-tz';
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
                practiceId: practiceId,
                patientStatus: patientStatus || 'unknown',
                originalPatientRequestForType: patientRequest,
                check_immediate_next_available: matchedAppointment.check_immediate_next_available || false,
                spokenName: matchedAppointment.spokenName || matchedAppointment.name
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

              // Update CallLog with successful appointment type identification using new schema fields
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

            // Update CallLog for no match case using new schema fields
            try {
              console.log(`[DB Log] Updating CallLog for vapiCallId: ${callId}, no appointment type match.`);
              await prisma.callLog.update({
                where: { vapiCallId: callId },
                data: {
                  detectedIntent: patientRequest,
                  callStatus: "APPOINTMENT_TYPE_NOT_FOUND",
                  patientStatus: patientStatus || 'unknown',
                  originalPatientRequestForType: patientRequest,
                  updatedAt: new Date(),
                }
              });
              console.log(`[DB Log] Successfully updated CallLog for no match case with enhanced fields`);
            } catch (error) {
              console.error(`[DB Log] Error updating CallLog for no match:`, error);
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
        const preferredDaysOfWeek = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.preferredDaysOfWeek as string : undefined;
        const timeBucket = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.timeBucket as string : undefined;
        const requestedDate = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.requestedDate as string : undefined;
        const timePreference = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.timePreference as string : undefined;
        const conversationState = (typeof toolArguments === 'object' && toolArguments !== null) ? toolArguments.conversationState as string : undefined;
        
        console.log(`[VAPI Tool Handler] checkAvailableSlots called with preferredDaysOfWeek: "${preferredDaysOfWeek}", timeBucket: "${timeBucket}"`);
        
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

          // **NEW: Check for immediate slot checking**
          if (parsedState.check_immediate_next_available === true && parsedState.immediate_check_performed !== true) {
            console.log(`[VAPI Tool Handler] Performing immediate slot check for appointment type: ${parsedState.lastAppointmentTypeName}`);
            
            // Fetch practice details for immediate check
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

            // Import the immediate slot functions
            const { findImmediateNextAvailableSlots, generateImmediateSlotResponse } = await import("@/lib/ai/slotHelper");
            
            try {
              // Find immediate slots
              const searchResult = await findImmediateNextAvailableSlots(
                parsedState.lastAppointmentTypeId,
                {
                  id: practice.id,
                  nexhealthSubdomain: practice.nexhealthSubdomain,
                  nexhealthLocationId: practice.nexhealthLocationId,
                  timezone: practice.timezone || 'America/Chicago'
                }
              );

              // Generate AI response
              const spokenName = parsedState.spokenName || parsedState.lastAppointmentTypeName;
              const aiResponse = await generateImmediateSlotResponse(
                searchResult,
                spokenName,
                practice.timezone || 'America/Chicago'
              );

              // Update conversation state
              const updatedState: ConversationState = {
                ...parsedState,
                immediate_check_performed: true,
                foundSlots: searchResult.foundSlots,
                nextAvailableDate: searchResult.nextAvailableDate || undefined
              };

              toolResponse = {
                toolCallId: toolId!,
                result: JSON.stringify({
                  tool_output_data: {
                    messageForAssistant: aiResponse
                  },
                  current_conversation_state_snapshot: JSON.stringify(updatedState)
                })
              };

              console.log(`[VAPI Tool Handler] Immediate slot check completed. Found ${searchResult.foundSlots.length} slots.`);
              break;

            } catch (error) {
              console.error(`[VAPI Tool Handler] Error during immediate slot check:`, error);
              toolResponse = {
                toolCallId: toolId!,
                error: "Error finding immediate available slots."
              };
              break;
            }
                     }

          // **ELSE: Handle standard slot checking with preferences**
          if (!preferredDaysOfWeek || !timeBucket || !requestedDate) {
            toolResponse = {
              toolCallId: toolId!,
              error: "Missing required parameters: preferredDaysOfWeek, timeBucket, and requestedDate for standard slot checking."
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

          // Normalize the date using AI with improved context
          console.log(`[Date Normalization] Input requestedDate: "${requestedDate}", Practice timezone: ${practice.timezone || 'America/Chicago'}`);
          const normalizedDate = await normalizeDateWithAI(requestedDate, practice.timezone || 'America/Chicago');
          console.log(`[Date Normalization] Output normalizedDate: "${normalizedDate}"`);
          
          if (!normalizedDate) {
            toolResponse = {
              toolCallId: toolId!,
              result: `I couldn't understand the date "${requestedDate}". Could you please specify a clearer date?`
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
          console.log(`[VAPI Tool Handler] Found ${providerNexHealthIds.length} providers for appointment type: ${lastAppointmentTypeId}`);

          // Call NexHealth API for slots
          const slotsData = await getNexhealthAvailableSlots(
            practice.nexhealthSubdomain,
            practice.nexhealthLocationId,
            normalizedDate,
            1, // Search 1 day for now
            providerNexHealthIds,
            lastAppointmentDuration
          );

          console.log(`[Slot Processing] Raw slots received from NexHealth for ${normalizedDate}:`, slotsData.length, 'slot groups');
          
          // Process and filter slots with extremely detailed logging
          const allSlots: Array<{ time: string; operatoryId?: number; providerId: number }> = [];
          
          for (const slotGroup of slotsData) {
            console.log(`[Slot Processing] Processing slot group for provider ${slotGroup.pid}: ${slotGroup.slots.length} slots`);
            for (const slot of slotGroup.slots) {
              allSlots.push({
                time: slot.time,
                operatoryId: slot.operatory_id,
                providerId: slotGroup.pid
              });
            }
          }

          console.log(`[Slot Processing] Total raw slots: ${allSlots.length}`);

          // Enhanced slot filtering with extremely detailed logging
          const practiceTimezone = practice.timezone || 'America/Chicago';
          const appointmentDurationMinutes = lastAppointmentDuration;
          const filteredSlots: Array<{ time: string; operatoryId?: number; providerId: number }> = [];

          console.log(`[Slot Filter] ===== BEGINNING DETAILED SLOT FILTERING =====`);
          console.log(`[Slot Filter] Practice timezone: ${practiceTimezone}`);
          console.log(`[Slot Filter] Appointment duration: ${appointmentDurationMinutes} minutes`);
          console.log(`[Slot Filter] Time preference: ${timePreference || 'none'}`);
          console.log(`[Slot Filter] Lunch break: 1:00 PM - 2:00 PM local time`);

          for (let i = 0; i < allSlots.length; i++) {
            const slot = allSlots[i];
            console.log(`[Slot Filter] --- Evaluating Raw Slot ${i + 1}/${allSlots.length} ---`);
            console.log(`[Slot Filter] Raw NexHealth Time: ${slot.time}`);

            const localStartTime = toZonedTime(new Date(slot.time), practiceTimezone);
            const calculatedLocalEndTime = new Date(localStartTime.getTime() + appointmentDurationMinutes * 60000);

            console.log(`[Slot Filter] Converted to Practice Local Time (${practiceTimezone}):`);
            console.log(`[Slot Filter] Local Start: ${format(localStartTime, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: practiceTimezone })}`);
            console.log(`[Slot Filter] Calculated Local End (Start + ${appointmentDurationMinutes}min): ${format(calculatedLocalEndTime, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: practiceTimezone })}`);

            // Lunch break check (13:00 to 14:00 local time)
            const lunchStartLocalHour = 13;
            const lunchEndLocalHour = 14;
            const slotStartLocalHour = localStartTime.getHours();
            const slotStartLocalMinutes = localStartTime.getMinutes();
            const slotCalculatedEndLocalHour = calculatedLocalEndTime.getHours();
            const slotCalculatedEndLocalMinutes = calculatedLocalEndTime.getMinutes();

            console.log(`[Slot Filter] Lunch Break Analysis:`);
            console.log(`[Slot Filter] Slot starts at: ${slotStartLocalHour}:${slotStartLocalMinutes.toString().padStart(2, '0')} local`);
            console.log(`[Slot Filter] Slot ends at: ${slotCalculatedEndLocalHour}:${slotCalculatedEndLocalMinutes.toString().padStart(2, '0')} local`);
            console.log(`[Slot Filter] Lunch break: ${lunchStartLocalHour}:00 - ${lunchEndLocalHour}:00 local`);

            let skipDueToLunch = false;
            let lunchSkipReason = '';

            // Check if slot STARTS within lunch
            if (slotStartLocalHour >= lunchStartLocalHour && slotStartLocalHour < lunchEndLocalHour) {
              skipDueToLunch = true;
              lunchSkipReason = `Slot starts at ${slotStartLocalHour}:${slotStartLocalMinutes.toString().padStart(2, '0')} during lunch break (1 PM - 2 PM local)`;
            }
            // Check if slot ENDS within lunch (but doesn't start in it)
            else if (slotCalculatedEndLocalHour >= lunchStartLocalHour && slotCalculatedEndLocalHour < lunchEndLocalHour) {
              // If it ends exactly at 1pm (13:00), it's okay. If it ends after 1pm but before 2pm, it's not.
              if (!(slotCalculatedEndLocalHour === lunchStartLocalHour && slotCalculatedEndLocalMinutes === 0)) {
                skipDueToLunch = true;
                lunchSkipReason = `Slot ends at ${slotCalculatedEndLocalHour}:${slotCalculatedEndLocalMinutes.toString().padStart(2, '0')} during lunch break (1 PM - 2 PM local)`;
              }
            }
            // Check if slot SPANS the entire lunch break
            else if (slotStartLocalHour < lunchStartLocalHour && 
                     (slotCalculatedEndLocalHour > lunchEndLocalHour || 
                      (slotCalculatedEndLocalHour === lunchEndLocalHour && slotCalculatedEndLocalMinutes > 0))) {
              skipDueToLunch = true;
              lunchSkipReason = `Slot spans entire lunch break (1 PM - 2 PM local). Starts ${slotStartLocalHour}:${slotStartLocalMinutes.toString().padStart(2, '0')}, Ends ${slotCalculatedEndLocalHour}:${slotCalculatedEndLocalMinutes.toString().padStart(2, '0')}`;
            }

            if (skipDueToLunch) {
              console.log(`[Slot Filter] DISCARDED: ${lunchSkipReason}`);
              console.log(`[Slot Filter] --- End Slot Evaluation (REJECTED) ---`);
              continue;
            } else {
              console.log(`[Slot Filter] KEPT: Slot at ${format(localStartTime, 'HH:mm aa', { timeZone: practiceTimezone })} passes lunch break filter`);
            }

            // Apply time preference filter if provided
            if (timePreference) {
              const preference = timePreference.toLowerCase();
              let skipForTimePreference = false;
              let timeSkipReason = '';
              
              console.log(`[Slot Filter] Time Preference Analysis:`);
              console.log(`[Slot Filter] User preference: "${timePreference}"`);
              console.log(`[Slot Filter] Slot time: ${slotStartLocalHour}:${slotStartLocalMinutes.toString().padStart(2, '0')}`);
              
              if (preference.includes('morning') && slotStartLocalHour >= 12) {
                skipForTimePreference = true;
                timeSkipReason = `Time preference is morning, but slot is at ${slotStartLocalHour}:${slotStartLocalMinutes.toString().padStart(2, '0')} (afternoon)`;
              }
              if (preference.includes('afternoon') && slotStartLocalHour < 12) {
                skipForTimePreference = true;
                timeSkipReason = `Time preference is afternoon, but slot is at ${slotStartLocalHour}:${slotStartLocalMinutes.toString().padStart(2, '0')} (morning)`;
              }
              // Handle specific time mentions like "11:00 AM", "11 AM", "after 3 PM", etc.
              if (preference.includes('11') && preference.includes('am')) {
                if (slotStartLocalHour !== 11 || slotStartLocalMinutes !== 0) {
                  skipForTimePreference = true;
                  timeSkipReason = `Time preference is 11:00 AM, but slot is at ${slotStartLocalHour}:${slotStartLocalMinutes.toString().padStart(2, '0')}`;
                }
              }
              
              if (skipForTimePreference) {
                console.log(`[Slot Filter] DISCARDED: ${timeSkipReason}`);
                console.log(`[Slot Filter] --- End Slot Evaluation (REJECTED) ---`);
                continue;
              } else {
                console.log(`[Slot Filter] KEPT: Slot passes time preference filter`);
              }
            }

            console.log(`[Slot Filter] FINAL RESULT: Slot at ${format(localStartTime, 'HH:mm aa', { timeZone: practiceTimezone })} ACCEPTED`);
            filteredSlots.push(slot);
            console.log(`[Slot Filter] --- End Slot Evaluation (ACCEPTED) ---`);
          }

          console.log(`[Slot Filter] ===== SLOT FILTERING COMPLETE =====`);
          console.log(`[Slot Filter] Final filtered slots: ${filteredSlots.length} out of ${allSlots.length} total`);

          // Format slots for presentation (limit to 3)
          const formattedSlots = filteredSlots.slice(0, 3).map(slot => {
            const slotDateTime = DateTime.fromISO(slot.time).setZone(practiceTimezone);
            return slotDateTime.toFormat('h:mm a'); // e.g., "9:00 AM"
          });

          console.log(`[Slot Response] Final slots to present to patient:`, formattedSlots);

          // Generate spoken response using AI
          const messageForAssistant = await generateSlotResponseMessage(
            lastAppointmentTypeName,
            normalizedDate,
            formattedSlots,
            timePreference
          );

          // Prepare updated conversation state - carry over all previous info and add new slot info
          const updatedConversationState: ConversationState = {
            // Carry over from previous state
            lastAppointmentTypeId: parsedState.lastAppointmentTypeId,
            lastAppointmentTypeName: parsedState.lastAppointmentTypeName,
            lastAppointmentDuration: parsedState.lastAppointmentDuration,
            practiceId: practiceId,
            patientStatus: parsedState.patientStatus,
            originalPatientRequestForType: parsedState.originalPatientRequestForType,
            // Add/update slot-specific information
            requestedDate,
            normalizedDateForSlots: normalizedDate,
            timePreferenceForSlots: timePreference,
            slotsOfferedToPatient: filteredSlots.slice(0, 3).map((slot, index) => ({
              time: formattedSlots[index],
              operatoryId: slot.operatoryId,
              providerId: slot.providerId
            }))
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

          // Update CallLog with enhanced slot information using new schema fields
          try {
            console.log(`[DB Log] Updating CallLog for slot check with enhanced fields...`);
            await prisma.callLog.update({
              where: { vapiCallId: callId },
              data: {
                callStatus: "SLOTS_CHECKED",
                requestedDateForSlots: requestedDate,
                normalizedDateForSlots: normalizedDate,
                timePreferenceForSlots: timePreference,
                slotsOfferedToPatient: filteredSlots.slice(0, 3).map((slot, index) => ({
                  time: formattedSlots[index],
                  operatoryId: slot.operatoryId,
                  providerId: slot.providerId
                })),
                lastToolConversationState: JSON.stringify(updatedConversationState),
                updatedAt: new Date(),
              }
            });
            console.log(`[DB Log] Successfully updated CallLog with enhanced slot tracking fields for vapiCallId: ${callId}`);
            console.log(`[DB Log] Stored: requestedDate=${requestedDate}, normalizedDate=${normalizedDate}, timePreference=${timePreference}, slotsOffered=${filteredSlots.length}`);
          } catch (error) {
            console.error(`[DB Log] Error updating CallLog for slot check:`, error);
            // Don't let CallLog errors stop the tool response
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