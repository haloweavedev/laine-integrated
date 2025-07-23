import { DateTime } from 'luxon';
import type { ConversationState, HandlerResult } from '@/types/vapi';
import { prisma } from '@/lib/prisma';

export async function handlePrepareConfirmation(
  currentState: ConversationState,
  toolCallId: string
): Promise<HandlerResult> {
  const { selectedSlot, spokenName } = currentState.appointmentBooking;

  if (!selectedSlot || !spokenName) {
    return {
      toolResponse: {
        toolCallId,
        error: "Cannot prepare confirmation. Key details are missing from the state."
      },
      newState: currentState
    };
  }

  const practice = await prisma.practice.findUnique({ where: { id: currentState.practiceId } });
  const practiceTimezone = practice?.timezone || 'America/Chicago';

  const formattedTime = DateTime.fromISO(selectedSlot.time, { zone: practiceTimezone })
                                .toFormat("cccc, MMMM d 'at' h:mm a");

  const confirmationMessage = `Okay, just to confirm, I have you down for a ${spokenName} on ${formattedTime}. Does that all sound correct?`;

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
    newState: currentState // No state change needed
  };
} 