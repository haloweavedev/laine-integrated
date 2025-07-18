import { prisma } from "@/lib/prisma";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import { matchUserSelectionToSlot } from "@/lib/ai/slotMatcher";
import { generateAppointmentNote } from "@/lib/ai/summaryHelper";
import { DateTime } from "luxon";
import type { ConversationState, HandlerResult } from "@/types/vapi";

interface BookAppointmentArgs {
  userSelection: string;
}

export async function handleConfirmBooking(
  currentState: ConversationState,
  toolArguments: BookAppointmentArgs,
  toolId: string
): Promise<HandlerResult> {
  const { userSelection } = toolArguments;
  
  console.log(`[ConfirmBookingHandler] Processing user selection: "${userSelection}"`);
  console.log(`[ConfirmBookingHandler] Current stage: ${currentState.currentStage}`);
  
  try {
    // Get practice details for all operations
    const practice = await prisma.practice.findUnique({
      where: { id: currentState.practiceId },
      select: { 
        timezone: true,
        nexhealthSubdomain: true,
        nexhealthLocationId: true
      }
    });

    if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Practice configuration not found for booking."
        },
        newState: currentState
      };
    }

    const practiceTimezone = practice.timezone || 'America/Chicago';

    // Handle different conversation stages
    if (currentState.currentStage === 'AWAITING_SLOT_CONFIRMATION') {
      // First-time slot selection - do NOT book yet, just confirm the choice
      console.log(`[ConfirmBookingHandler] Processing initial slot selection`);
      
      const matchedSlot = await matchUserSelectionToSlot(
        userSelection,
        currentState.appointmentBooking.presentedSlots || [],
        practiceTimezone
      );

      if (!matchedSlot) {
        console.log(`[ConfirmBookingHandler] No slot match found for user selection`);
        return {
          toolResponse: {
            toolCallId: toolId,
            result: "I'm sorry, I couldn't understand which time you'd prefer. Could you please choose from the times I mentioned?"
          },
          newState: currentState
        };
      }

      console.log(`[ConfirmBookingHandler] Successfully matched slot: ${matchedSlot.time}`);

      // Format the confirmation time
      const confirmationTime = DateTime.fromISO(matchedSlot.time, { zone: practiceTimezone });
      const dayName = confirmationTime.toFormat('cccc');
      const time = confirmationTime.toFormat('h:mm a');
      const date = confirmationTime.toFormat('MMMM d');

      // Update state with selected slot and move to final confirmation stage
      const newState: ConversationState = {
        ...currentState,
        currentStage: 'AWAITING_FINAL_CONFIRMATION',
        appointmentBooking: {
          ...currentState.appointmentBooking,
          selectedSlot: matchedSlot
        }
      };

      const confirmationMessage = `Okay, I have you down for ${dayName}, ${date} at ${time}. Is that correct?`;

      return {
        toolResponse: {
          toolCallId: toolId,
          result: confirmationMessage
        },
        newState
      };

    } else if (currentState.currentStage === 'AWAITING_FINAL_CONFIRMATION') {
      // Final confirmation - either book the appointment or handle change of mind
      console.log(`[ConfirmBookingHandler] Processing final confirmation`);

      // Check if user is confirming or wants to change
      const confirmationKeywords = ['yes', 'correct', 'right', 'that\'s right', 'perfect', 'good', 'yep', 'yeah', 'sounds good'];
      const changeKeywords = ['no', 'actually', 'wait', 'different', 'change', 'another', 'morning', 'afternoon', 'evening', 'earlier', 'later'];
      
      const userSelectionLower = userSelection.toLowerCase();
      const isConfirming = confirmationKeywords.some(keyword => userSelectionLower.includes(keyword));
      const isChanging = changeKeywords.some(keyword => userSelectionLower.includes(keyword));

      if (isChanging && !isConfirming) {
        // User wants to change their mind - revert to slot selection stage
        console.log(`[ConfirmBookingHandler] User wants to change selection, reverting to slot presentation`);
        
        const revertedState: ConversationState = {
          ...currentState,
          currentStage: 'AWAITING_SLOT_CONFIRMATION',
          appointmentBooking: {
            ...currentState.appointmentBooking,
            selectedSlot: undefined // Clear the selected slot
          }
        };

        // Check if they mentioned a specific time preference
        if (userSelectionLower.includes('morning') || userSelectionLower.includes('afternoon') || userSelectionLower.includes('evening')) {
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "No problem! Let me check for other available times."
            },
            newState: revertedState,
            nextTool: {
              toolName: 'checkAvailableSlots',
              toolArguments: { 
                timeBucket: userSelectionLower.includes('morning') ? 'Morning' : 
                           userSelectionLower.includes('afternoon') ? 'Afternoon' : 'Evening'
              }
            }
          };
        } else {
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "No problem! Would you like me to check for other available times?"
            },
            newState: revertedState
          };
        }
      }

      // User is confirming - proceed with actual booking
      if (!currentState.appointmentBooking.selectedSlot) {
        return {
          toolResponse: {
            toolCallId: toolId,
            error: "No slot selected for booking."
          },
          newState: currentState
        };
      }

      const selectedSlot = currentState.appointmentBooking.selectedSlot;
      console.log(`[ConfirmBookingHandler] User confirmed, proceeding with booking for slot: ${selectedSlot.time}`);

      const appointmentNote = await generateAppointmentNote(currentState);
      
      // Log the generated note
      await prisma.toolLog.updateMany({
        where: { toolCallId: toolId },
        data: { result: `[AI Summary] Generated Note: "${appointmentNote}"` }
      });
      console.log(`[DB Log] Logged generated appointment note for tool call ${toolId}.`);

      // Construct NexHealth payload
      const startTimeLocal = DateTime.fromISO(selectedSlot.time, { zone: practiceTimezone });
      const endTimeLocal = startTimeLocal.plus({ minutes: currentState.appointmentBooking.duration || 30 });

      const appointmentPayload = {
        appt: {
          patient_id: currentState.patientDetails.nexhealthPatientId,
          provider_id: selectedSlot.providerId,
          operatory_id: selectedSlot.operatory_id || 0,
          start_time: startTimeLocal.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
          end_time: endTimeLocal.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
          note: appointmentNote
        }
      };

      console.log(`[ConfirmBookingHandler] Constructed appointment payload:`, appointmentPayload);
      
      // Log the payload for debugging
      await prisma.toolLog.updateMany({
        where: { toolCallId: toolId },
        data: { result: `[NexHealth Request] Sending payload: ${JSON.stringify(appointmentPayload)}` }
      });
      console.log(`[DB Log] Logged NexHealth request payload for tool call ${toolId}.`);

      // Make the API call
      try {
        console.log(`[ConfirmBookingHandler] Calling NexHealth API to create appointment`);
        
        const apiResponse = await fetchNexhealthAPI(
          '/appointments',
          practice.nexhealthSubdomain,
          { location_id: practice.nexhealthLocationId },
          'POST',
          appointmentPayload
        );

        console.log(`[ConfirmBookingHandler] Successfully created appointment:`, apiResponse);

        // Success - Return final confirmation
        const finalState: ConversationState = {
          ...currentState,
          currentStage: 'BOOKING_CONFIRMED'
        };

        // Format the confirmation message
        const confirmationTime = DateTime.fromISO(selectedSlot.time, { zone: practiceTimezone });
        const dayName = confirmationTime.toFormat('cccc');
        const time = confirmationTime.toFormat('h:mm a');
        const date = confirmationTime.toFormat('MMMM d');
        const appointmentType = currentState.appointmentBooking.spokenName || 
                               currentState.appointmentBooking.typeName || 
                               'appointment';

        const confirmationMessage = `You're all set! I've booked your ${appointmentType} for ${dayName}, ${date} at ${time}. You should receive a confirmation shortly. Is there anything else I can help you with today?`;

        console.log(`[ConfirmBookingHandler] Booking confirmed successfully`);

        return {
          toolResponse: {
            toolCallId: toolId,
            result: confirmationMessage
          },
          newState: finalState
        };

      } catch (apiError) {
        // Handle API failure
        console.error(`[ConfirmBookingHandler] Failed to create appointment:`, apiError);
        
        // Check if the error indicates the slot is already booked
        const errorMessageText = apiError instanceof Error ? apiError.message.toLowerCase() : '';
        if (errorMessageText.includes('slot is not available') || errorMessageText.includes('already booked')) {
          const revertedState: ConversationState = {
            ...currentState,
            currentStage: 'AWAITING_SLOT_CONFIRMATION',
            appointmentBooking: {
              ...currentState.appointmentBooking,
              selectedSlot: undefined
            }
          };
          
          return {
            toolResponse: {
              toolCallId: toolId,
              result: `I'm so sorry, it looks like that time was just taken. Would you like me to check for other available times?`
            },
            newState: revertedState
          };
        }
        
        // Generic error fallback
        const errorMessage = "I'm sorry, but there was a system error and I couldn't finalize your booking. Our staff has been notified and will give you a call back shortly to confirm a time. Thank you for your patience.";

        return {
          toolResponse: {
            toolCallId: toolId,
            result: errorMessage
          },
          newState: {
            ...currentState,
            currentStage: 'AWAITING_SLOT_CONFIRMATION'
          }
        };
      }
      
    } else {
      // Invalid stage
      console.error(`[ConfirmBookingHandler] Invalid stage: ${currentState.currentStage}`);
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Invalid conversation state for booking."
        },
        newState: currentState
      };
    }

  } catch (error) {
    console.error(`[ConfirmBookingHandler] Unexpected error in booking handler:`, error);
    return {
      toolResponse: {
        toolCallId: toolId,
        error: "An unexpected error occurred while processing your booking request."
      },
      newState: currentState
    };
  }
}