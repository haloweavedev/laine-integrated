import { prisma } from "@/lib/prisma";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import { generateAppointmentNote } from "@/lib/ai/summaryHelper";
import { DateTime } from "luxon";
import type { ConversationState, HandlerResult, ApiLog } from "@/types/vapi";

interface BookAppointmentArgs {
  userSelection: string;
}

export async function handleConfirmBooking(
  currentState: ConversationState,
  toolArguments: BookAppointmentArgs,
  toolId: string
): Promise<HandlerResult> {
  const { userSelection } = toolArguments;
  
  // Initialize API log array to capture all external calls
  const apiLog: ApiLog = [];
  
  console.log(`[ConfirmBookingHandler] Processing final booking confirmation: "${userSelection}"`);
  
  try {
    // Get practice details
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

    // Ensure we have a selected slot
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
    console.log(`[ConfirmBookingHandler] Proceeding with booking for slot: ${selectedSlot.time}`);

    // Generate appointment note
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

    // Make the API call with logging
    console.log(`[ConfirmBookingHandler] Calling NexHealth API to create appointment`);
    
    const { data: apiResponse, apiLog: updatedApiLog } = await fetchNexhealthAPI(
      '/appointments',
      practice.nexhealthSubdomain,
      { location_id: practice.nexhealthLocationId },
      'POST',
      appointmentPayload,
      apiLog
    );

    console.log(`[ConfirmBookingHandler] Successfully created appointment:`, apiResponse);

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
      newState: currentState,
      toolResponse: {
        toolCallId: toolId,
        result: { apiLog: updatedApiLog },
        message: {
          type: "request-complete",
          role: "assistant",
          content: confirmationMessage
        }
      }
    };

  } catch (error) {
    console.error(`[ConfirmBookingHandler] Failed to create appointment:`, error);
    
    // Check if the error indicates the slot is already booked
    const errorMessageText = error instanceof Error ? error.message.toLowerCase() : '';
    if (errorMessageText.includes('slot is not available') || errorMessageText.includes('already booked')) {
      return {
        toolResponse: {
          toolCallId: toolId,
          result: { apiLog: apiLog },
          message: {
            type: "request-failed",
            role: "assistant",
            content: "I'm so sorry, it looks like that time was just taken. Would you like me to check for other available times?"
          }
        },
        newState: currentState
      };
    }
    
    // Generic error fallback
    return {
      toolResponse: {
        toolCallId: toolId,
        result: { apiLog: apiLog },
        message: {
          type: "request-failed",
          role: "assistant",
          content: "I'm sorry, but there was a system error and I couldn't finalize your booking. Our staff has been notified and will give you a call back shortly to confirm a time. Thank you for your patience."
        }
      },
      newState: currentState
    };
  }
}