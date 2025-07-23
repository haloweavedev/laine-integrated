import { matchUserSelectionToSlot } from '../ai/slotMatcher';
import { ConversationState } from '../../types/vapi';
import { prisma } from '@/lib/prisma';
import { mergeState } from '@/lib/utils/state-helpers';
import { DateTime } from 'luxon';

interface SelectAndConfirmSlotArgs {
  userSelection: string;
}

import { HandlerResult } from '../../types/vapi';

export async function handleSelectAndConfirmSlot(
  currentState: ConversationState,
  toolArguments: SelectAndConfirmSlotArgs,
  toolCallId: string
): Promise<HandlerResult> {
  console.log('[SelectAndConfirmSlot] Processing user selection:', toolArguments.userSelection);

  // Get practice details for timezone
  const practice = await prisma.practice.findUnique({
    where: { id: currentState.practiceId },
    select: { timezone: true }
  });

  if (!practice) {
    // Handle case where practice is not found
    return {
      toolResponse: { toolCallId, error: "Practice configuration not found." },
      newState: currentState
    };
  }
  const practiceTimezone = practice.timezone || 'America/Chicago'; // Use a sensible default
  
  // Check if presentedSlots exists and is not empty
  if (!currentState.appointmentBooking?.presentedSlots || currentState.appointmentBooking.presentedSlots.length === 0) {
    console.log('[SelectAndConfirmSlot] ERROR: No presented slots available');
    return {
      toolResponse: {
        toolCallId,
        error: "I don't see any available time slots to choose from. Let me check availability for you first."
      },
      newState: currentState
    };
  }

  // Get the presented slots from current state
  const presentedSlots = currentState.appointmentBooking.presentedSlots;

  console.log('[SelectAndConfirmSlot] Matching selection against', presentedSlots.length, 'slots');
  
  // Use AI slot matcher to find the selected slot
  const matchedSlot = await matchUserSelectionToSlot(
    toolArguments.userSelection,
    presentedSlots,
    practiceTimezone
  );

  if (!matchedSlot) {
    console.log('[SelectAndConfirmSlot] ERROR: Could not match user selection');
    return {
      toolResponse: {
        toolCallId,
        error: "I'm not sure which time slot you're referring to. Could you please be more specific? For example, you could say '10:30 AM' or 'the first option'."
      },
      newState: currentState
    };
  }

  console.log('[SelectAndConfirmSlot] Successfully matched slot:', matchedSlot);

  // Get the spokenName for the confirmation message
  const { spokenName } = currentState.appointmentBooking;
  if (!spokenName) {
    console.log('[SelectAndConfirmSlot] ERROR: Missing spokenName in state');
    return {
      toolResponse: {
        toolCallId,
        error: "Cannot prepare confirmation. Appointment type information is missing."
      },
      newState: currentState
    };
  }

  // Generate confirmation message using the matched slot and appointment details
  const formattedTime = DateTime.fromISO(matchedSlot.time, { zone: practiceTimezone })
                                .toFormat("cccc, MMMM d 'at' h:mm a");

  const confirmationMessage = `Okay, just to confirm, I have you down for a ${spokenName} on ${formattedTime}. Does that all sound correct?`;

  console.log('[SelectAndConfirmSlot] Generated confirmation message:', confirmationMessage);

  // Update the state with the selected slot and clear presented slots
  const newState = mergeState(currentState, {
    appointmentBooking: {
      selectedSlot: matchedSlot,
      presentedSlots: [] // Clear the list of options once selection is made
    }
  });

  // Return the confirmation message directly to the user
  return {
    toolResponse: {
      toolCallId,
      result: { success: true },
      message: {
        type: 'assistant-message',
        role: 'assistant',
        content: confirmationMessage
      }
    },
    newState
  };
} 