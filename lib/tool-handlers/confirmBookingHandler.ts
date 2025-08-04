import { prisma } from "@/lib/prisma";
import { confirmNexhealthBooking } from "@/lib/nexhealth";
import { DateTime } from "luxon";
import type { HandlerResult, ApiLog } from "@/types/vapi";
import type { ConversationState } from "@/types/laine";
import { mergeState } from '@/lib/utils/state-helpers';

export async function handleConfirmBooking(
  currentState: ConversationState,
  toolId: string
): Promise<HandlerResult> {
  console.log(`[ConfirmBookingHandler] Attempting to finalize held appointment slot`);
  
  // Initialize API log array to capture all external calls
  const apiLog: ApiLog = [];
  
  try {
    // Validate required state for Hold & Confirm model
    if (!currentState.booking.heldSlotId) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Cannot confirm booking: No slot has been held. I must use the selectAndConfirmSlot tool first to hold a slot."
        },
        newState: currentState
      };
    }

    if (!currentState.patient.id) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Cannot confirm booking: Patient ID is required but not found in state."
        },
        newState: currentState
      };
    }

    const { heldSlotId, selectedSlot } = currentState.booking;

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

    console.log(`[ConfirmBookingHandler] Proceeding to confirm held slot: ${heldSlotId} for patient: ${currentState.patient.id}`);

    // Call the Hold & Confirm API to finalize the booking
    const confirmResult = await confirmNexhealthBooking(
      practice.nexhealthSubdomain,
      heldSlotId,
      currentState.patient.id,
      apiLog
    );

    if (!confirmResult.success) {
      console.error(`[ConfirmBookingHandler] Failed to confirm held slot: ${confirmResult.error}`);
      
      return {
        toolResponse: {
          toolCallId: toolId,
          result: { success: false, apiLog: confirmResult.apiLog },
          message: {
            type: "request-failed",
            role: "assistant",
            content: confirmResult.error?.includes('expired') || confirmResult.error?.includes('hold')
              ? "I'm sorry, the time slot hold has expired. Let me check for available times again."
              : "I encountered an issue finalizing your booking. Our staff has been notified and will call you shortly to confirm your appointment."
          }
        },
        newState: currentState
      };
    }

    console.log(`[ConfirmBookingHandler] Successfully confirmed booking with ID: ${confirmResult.bookingId}`);

    // Update state to clear hold information and set confirmed booking ID
    const newState = mergeState(currentState, {
      booking: {
        confirmedBookingId: confirmResult.bookingId,
        heldSlotId: undefined, // Clear the hold ID
        heldSlotExpiresAt: undefined // Clear the expiration
      }
    });

    // Format the confirmation message
    if (!selectedSlot) {
      console.error('[ConfirmBookingHandler] Missing selectedSlot in state');
      return {
        toolResponse: {
          toolCallId: toolId,
          result: { success: true, bookingId: confirmResult.bookingId, apiLog: confirmResult.apiLog },
          message: {
            type: "request-complete",
            role: "assistant",
            content: "You're all set! I've confirmed your appointment. You should receive a confirmation shortly. Is there anything else I can help you with today?"
          }
        },
        newState
      };
    }

    const confirmationTime = DateTime.fromISO(selectedSlot.time, { zone: practiceTimezone });
    const dayName = confirmationTime.toFormat('cccc');
    const time = confirmationTime.toFormat('h:mm a');
    const date = confirmationTime.toFormat('MMMM d');
    const appointmentType = currentState.booking.spokenName || 
                           currentState.booking.appointmentTypeName || 
                           'appointment';

    const confirmationMessage = `Perfect! I've confirmed your ${appointmentType} for ${dayName}, ${date} at ${time}. You should receive a confirmation shortly. Is there anything else I can help you with today?`;

    console.log(`[ConfirmBookingHandler] Hold & Confirm booking completed successfully`);

    return {
      newState,
      toolResponse: {
        toolCallId: toolId,
        result: { success: true, bookingId: confirmResult.bookingId, apiLog: confirmResult.apiLog },
        message: {
          type: "request-complete",
          role: "assistant",
          content: confirmationMessage
        }
      }
    };

  } catch (error) {
    console.error(`[ConfirmBookingHandler] Unexpected error during booking confirmation:`, error);
    
    return {
      toolResponse: {
        toolCallId: toolId,
        result: { success: false, apiLog },
        message: {
          type: "request-failed",
          role: "assistant",
          content: "I encountered an unexpected error while confirming your booking. Our staff has been notified and will call you shortly to finalize your appointment."
        }
      },
      newState: currentState
    };
  }
}