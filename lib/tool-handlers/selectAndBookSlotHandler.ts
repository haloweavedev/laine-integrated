import { matchUserSelectionToSlot } from '../ai/slotMatcher';
import { ConversationState } from '../../types/laine';
import { prisma } from '@/lib/prisma';
import { mergeState } from '@/lib/utils/state-helpers';
import { DateTime } from 'luxon';
import { bookNexhealthAppointment } from '@/lib/nexhealth';

interface SelectAndBookSlotArgs {
  userSelection: string;
  finalConfirmation?: boolean;
}

import { HandlerResult } from '../../types/vapi';

export async function handleSelectAndBookSlot(
  currentState: ConversationState,
  toolArguments: SelectAndBookSlotArgs,
  toolCallId: string
): Promise<HandlerResult> {
  console.log('[SelectAndBookSlot] Processing user selection:', toolArguments.userSelection, 'finalConfirmation:', toolArguments.finalConfirmation);

  const { userSelection, finalConfirmation } = toolArguments;

  // Get practice details for timezone and booking configuration
  const practice = await prisma.practice.findUnique({
    where: { id: currentState.practiceId },
    select: { 
      timezone: true,
      nexhealthSubdomain: true,
      nexhealthLocationId: true
    }
  });

  if (!practice) {
    return {
      toolResponse: { toolCallId, error: "Practice configuration not found." },
      newState: currentState
    };
  }

  const practiceTimezone = practice.timezone || 'America/Chicago';
  
  // Check if presentedSlots exists and is not empty
  if (!currentState.booking?.presentedSlots || currentState.booking.presentedSlots.length === 0) {
    console.log('[SelectAndBookSlot] ERROR: No presented slots available');
    return {
      toolResponse: {
        toolCallId,
        error: "I don't see any available time slots to choose from. Let me check availability for you first."
      },
      newState: currentState
    };
  }

  // If we don't have a selected slot yet, we need to match the user's selection
  let matchedSlot = currentState.booking.selectedSlot;

  if (!matchedSlot) {
    // Get the presented slots from current state
    const presentedSlots = currentState.booking.presentedSlots;

    console.log('[SelectAndBookSlot] Matching selection against', presentedSlots.length, 'slots');
    
    // Use AI slot matcher to find the selected slot
    const matchResult = await matchUserSelectionToSlot(
      userSelection,
      presentedSlots,
      practiceTimezone
    );
    
    matchedSlot = matchResult || undefined;

    if (!matchedSlot) {
      console.log('[SelectAndBookSlot] ERROR: Could not match user selection');
      return {
        toolResponse: {
          toolCallId,
          error: "I'm not sure which time slot you're referring to. Could you please be more specific? For example, you could say '10:30 AM' or 'the first option'."
        },
        newState: currentState
      };
    }

    console.log('[SelectAndBookSlot] Successfully matched slot:', matchedSlot);
  }

  // Generate formatted time for use in messages
  const formattedTime = DateTime.fromISO(matchedSlot.time, { zone: practiceTimezone })
                                .toFormat("cccc, MMMM d 'at' h:mm a");

  // Update the state with the selected slot and clear presented slots
  const newStateWithSelection = mergeState(currentState, {
    booking: {
      selectedSlot: matchedSlot,
      presentedSlots: [] // Clear the list of options once selection is made
    }
  });

  // If we DO NOT have final confirmation yet, ask for it.
  if (!finalConfirmation) {
    console.log('[SelectAndBookSlot] Slot selected. Asking for final confirmation.');
    
    // Check if patient has been identified (required for booking)
    if (!currentState.patient.id) {
      // Patient not identified yet - cannot book without patient ID
      const urgentFlowMessage = `Okay, I'd like to reserve that ${formattedTime} slot for you. Before I can book it, I'll need to get your details. Are you a new or an existing patient?`;
      
      console.log('[SelectAndBookSlot] Urgent flow: Patient ID missing, deferring booking until patient identified');
      
      return {
        toolResponse: {
          toolCallId,
          result: { needsConfirmation: true },
          message: {
            type: 'assistant-message',
            role: 'assistant',
            content: urgentFlowMessage
          }
        },
        newState: newStateWithSelection
      };
    }

    const { spokenName } = currentState.booking;
    const confirmationMessage = `Perfect. Just to confirm, I have you down for a ${spokenName || 'appointment'} on ${formattedTime}. Does that all sound correct?`;
    
    return {
      toolResponse: {
        toolCallId,
        result: { needsConfirmation: true },
        message: {
          type: 'assistant-message', 
          role: 'assistant',
          content: confirmationMessage
        }
      },
      newState: newStateWithSelection
    };
  }

  // If we HAVE final confirmation, proceed to book.
  console.log('[SelectAndBookSlot] Final confirmation received. Proceeding to book.');

  if (!currentState.patient.id) {
    return {
      toolResponse: {
        toolCallId,
        error: "Cannot book appointment: Patient ID is required but not found in state."
      },
      newState: newStateWithSelection
    };
  }

  if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
    return {
      toolResponse: {
        toolCallId,
        error: "Practice NexHealth configuration not found for booking."
      },
      newState: newStateWithSelection
    };
  }

  try {
    const bookingResult = await bookNexhealthAppointment(
      practice.nexhealthSubdomain,
      practice.nexhealthLocationId,
      currentState.patient.id,
      matchedSlot,
      newStateWithSelection // Pass the full state for the note
    );

    if (bookingResult.success) {
      console.log(`[SelectAndBookSlot] Successfully booked appointment with ID: ${bookingResult.bookingId}`);
      
      // Update state with confirmed booking ID
      const newStateWithBooking = mergeState(newStateWithSelection, {
        booking: {
          confirmedBookingId: bookingResult.bookingId,
          selectedSlot: undefined, // Clear the selected slot now that it's booked
          heldSlotId: undefined, // Clear any old hold data
          heldSlotExpiresAt: undefined
        },
        lastAction: 'HELD_SLOT' // Update to final action
      });

      const { spokenName } = currentState.booking;
      const successMessage = `You're all set! I've booked your ${spokenName || 'appointment'} for ${formattedTime}. You should receive a confirmation shortly. Is there anything else I can help you with today?`;
      
      return {
        toolResponse: {
          toolCallId,
          result: { success: true, bookingId: bookingResult.bookingId },
          message: {
            type: 'request-complete',
            role: 'assistant',
            content: successMessage
          }
        },
        newState: newStateWithBooking
      };
    } else {
      console.error('[SelectAndBookSlot] Booking failed:', bookingResult.error);
      
      // Clear selected slot from state and suggest re-checking slots
      const newStateWithoutSelection = mergeState(currentState, {
        booking: {
          selectedSlot: undefined,
          presentedSlots: []
        }
      });

      const failureMessage = `I'm so sorry, it looks like that time was just taken while we were speaking. Let me check for other available times for your ${currentState.booking.spokenName || 'appointment'}.`;
      
      return {
        toolResponse: {
          toolCallId,
          result: { success: false, error: bookingResult.error },
          message: {
            type: 'request-failed',
            role: 'assistant', 
            content: failureMessage
          }
        },
        newState: newStateWithoutSelection
      };
    }
  } catch (error) {
    console.error('[SelectAndBookSlot] Unexpected error during booking:', error);
    
    return {
      toolResponse: {
        toolCallId,
        result: { success: false },
        error: "I encountered an unexpected error while booking your appointment. Our staff has been notified and will call you shortly to finalize your appointment."
      },
      newState: newStateWithSelection
    };
  }
}