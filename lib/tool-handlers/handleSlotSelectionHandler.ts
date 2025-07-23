import { matchUserSelectionToSlot } from '../ai/slotMatcher';
import { ConversationState } from '../../types/vapi';
import { prisma } from '@/lib/prisma';
import { mergeState } from '@/lib/utils/state-helpers';

interface HandleSlotSelectionArgs {
  userSelection: string;
}

import { HandlerResult } from '../../types/vapi';

export async function handleSlotSelectionHandler(
  currentState: ConversationState,
  toolArguments: HandleSlotSelectionArgs,
  toolCallId: string
): Promise<HandlerResult> {
  console.log('[HandleSlotSelectionHandler] Processing user selection:', toolArguments.userSelection);

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
    console.log('[HandleSlotSelectionHandler] ERROR: No presented slots available');
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

  console.log('[HandleSlotSelectionHandler] Matching selection against', presentedSlots.length, 'slots');
  
  // Use AI slot matcher to find the selected slot
  const matchedSlot = await matchUserSelectionToSlot(
    toolArguments.userSelection,
    presentedSlots,
    practiceTimezone
  );

  if (!matchedSlot) {
    console.log('[HandleSlotSelectionHandler] ERROR: Could not match user selection');
    return {
      toolResponse: {
        toolCallId,
        error: "I'm not sure which time slot you're referring to. Could you please be more specific? For example, you could say '10:30 AM' or 'the first option'."
      },
      newState: currentState
    };
  }

  console.log('[HandleSlotSelectionHandler] Successfully matched slot:', matchedSlot);

  // Update the state with the selected slot
  const newState = mergeState(currentState, {
    appointmentBooking: {
      selectedSlot: matchedSlot
    }
  });

  // Return a silent confirmation
  return {
    toolResponse: {
      toolCallId,
      result: { success: true }
    },
    newState
  };
} 