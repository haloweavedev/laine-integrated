import { matchUserSelectionToSlot } from '../ai/slotMatcher';
import { ConversationState } from '../../types/laine';
import { prisma } from '@/lib/prisma';
import { mergeState } from '@/lib/utils/state-helpers';
import { DateTime } from 'luxon';
import { handleHoldAppointmentSlot } from './holdAppointmentSlotHandler';

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
  if (!currentState.booking?.presentedSlots || currentState.booking.presentedSlots.length === 0) {
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
  const presentedSlots = currentState.booking.presentedSlots;

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

  // Check if patient has been identified (required for holding slots)
  if (!currentState.patient.id) {
    // Patient not identified yet - cannot hold slot without patient ID
    const urgentFlowMessage = `Okay, I'd like to reserve that ${formattedTime} slot for you. Before I can hold it, I'll need to get your details. Are you a new or an existing patient?`;
    
    console.log('[SelectAndConfirmSlot] Urgent flow: Patient ID missing, deferring hold until patient identified');
    
    return {
      toolResponse: {
        toolCallId,
        result: { success: true },
        message: {
          type: 'assistant-message',
          role: 'assistant',
          content: urgentFlowMessage
        }
      },
      newState: newStateWithSelection
    };
  }

  // Patient identified - proceed with slot hold using the "Hold & Confirm" model
  console.log('[SelectAndConfirmSlot] Patient identified, initiating slot hold...');
  
  // Create a temporary slot ID from the matched slot data
  // Note: In a real implementation, this would be the actual slot ID from NexHealth
  const slotId = `${matchedSlot.providerId}_${matchedSlot.time}_${matchedSlot.operatory_id || 0}`;
  
  try {
    // Programmatically invoke the hold slot handler
    const holdResult = await handleHoldAppointmentSlot(
      newStateWithSelection,
      { slotId },
      `${toolCallId}_hold`
    );

    if (typeof holdResult.toolResponse.result === 'object' && holdResult.toolResponse.result?.success) {
      // Hold succeeded - ask for confirmation
      const { spokenName } = currentState.booking;
      const confirmationMessage = `Great! I've reserved that ${spokenName || 'appointment'} slot for ${formattedTime}. Just to confirm - does that work for you?`;
      
      console.log('[SelectAndConfirmSlot] Slot successfully held, asking for confirmation');
      
      return {
        toolResponse: {
          toolCallId,
          result: { success: true, slotHeld: true },
          message: {
            type: 'assistant-message',
            role: 'assistant',
            content: confirmationMessage
          }
        },
        newState: holdResult.newState
      };
    } else {
      // Hold failed - slot likely taken
      console.error('[SelectAndConfirmSlot] Slot hold failed:', holdResult.toolResponse.error);
      
      const failureMessage = holdResult.toolResponse.message?.content || 
                             "I'm sorry, that slot was just taken. Let me check for other available times.";
      
      return {
        toolResponse: {
          toolCallId,
          result: { success: false, slotHeld: false },
          message: {
            type: 'request-failed',
            role: 'assistant',  
            content: failureMessage
          }
        },
        newState: currentState // Revert to original state since hold failed
      };
    }
  } catch (error) {
    console.error('[SelectAndConfirmSlot] Error during slot hold:', error);
    
    return {
      toolResponse: {
        toolCallId,
        result: { success: false, slotHeld: false },
        error: "I encountered an issue trying to reserve that slot. Let me check for other available times."
      },
      newState: newStateWithSelection
    };
  }
} 