import { matchUserSelectionToSlot } from '../ai/slotMatcher';
import { ConversationState } from '../../types/vapi';

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
  const practiceTimezone = "America/Detroit"; // Default practice timezone
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
  const newState: ConversationState = {
    ...currentState,
    appointmentBooking: {
      ...currentState.appointmentBooking,
      selectedSlot: matchedSlot
    }
  };

  // Return a confirmation message
  return {
    toolResponse: {
      toolCallId,
      result: { success: true },
      message: {
        type: 'assistant-message',
        role: 'assistant',
        content: `Okay, I've selected ${matchedSlot.time} for you.`
      }
    },
    newState
  };
} 