import { prisma } from "@/lib/prisma";
import { holdNexhealthSlot } from "@/lib/nexhealth";
import { DateTime } from "luxon";
import type { HandlerResult, ApiLog } from "@/types/vapi";
import type { ConversationState } from "@/types/laine";
import { mergeState } from '@/lib/utils/state-helpers';

interface HoldAppointmentSlotArgs {
  slotId: string;
}

export async function handleHoldAppointmentSlot(
  currentState: ConversationState,
  toolArguments: HoldAppointmentSlotArgs,
  toolId: string
): Promise<HandlerResult> {
  console.log(`[HoldSlotHandler] Processing slot hold request for slotId: ${toolArguments.slotId}`);
  
  const apiLog: ApiLog = [];
  
  try {
    // Validate required state
    if (!currentState.patient.id) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Cannot hold slot: Patient ID is required but not found in state."
        },
        newState: currentState
      };
    }

    if (!currentState.booking.duration) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Cannot hold slot: Appointment duration is required but not found in state."
        },
        newState: currentState
      };
    }

    // Get practice details
    const practice = await prisma.practice.findUnique({
      where: { id: currentState.practiceId },
      select: { 
        nexhealthSubdomain: true,
        nexhealthLocationId: true,
        timezone: true
      }
    });

    if (!practice || !practice.nexhealthSubdomain) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Practice configuration not found for holding slot."
        },
        newState: currentState
      };
    }

    console.log(`[HoldSlotHandler] Attempting to hold slot ${toolArguments.slotId} for patient ${currentState.patient.id}`);

    // Call NexHealth API to hold the slot
    const holdResult = await holdNexhealthSlot(
      practice.nexhealthSubdomain,
      toolArguments.slotId,
      currentState.patient.id,
      currentState.booking.duration,
      apiLog
    );

    if (holdResult.success && holdResult.heldSlotId) {
      console.log(`[HoldSlotHandler] Successfully held slot with hold ID: ${holdResult.heldSlotId}`);
      
      // Calculate expiration time (10 minutes from now)
      const expiresAt = DateTime.now().plus({ minutes: 10 }).toISO();
      
      // Update state with hold information
      const newState = mergeState(currentState, {
        booking: {
          heldSlotId: holdResult.heldSlotId,
          heldSlotExpiresAt: expiresAt
        },
        lastAction: 'HELD_SLOT'
      });

      return {
        toolResponse: {
          toolCallId: toolId,
          result: { 
            success: true, 
            heldSlotId: holdResult.heldSlotId,
            expiresAt: expiresAt,
            apiLog: holdResult.apiLog
          },
          message: {
            type: "request-complete",
            role: "assistant",
            content: "I've successfully reserved that time slot for you. It's held for the next 10 minutes while we confirm your details."
          }
        },
        newState
      };
    } else {
      // Hold failed - slot likely taken or no longer available
      console.error(`[HoldSlotHandler] Failed to hold slot: ${holdResult.error}`);
      
      const errorMessage = holdResult.error?.toLowerCase().includes('slot') || holdResult.error?.toLowerCase().includes('available') 
        ? "I'm sorry, that time slot was just taken by someone else. Let me check for other available times for you."
        : "I encountered an issue trying to reserve that slot. Let me try to find another available time.";

      return {
        toolResponse: {
          toolCallId: toolId,
          result: { 
            success: false, 
            error: holdResult.error,
            apiLog: holdResult.apiLog
          },
          message: {
            type: "request-failed",
            role: "assistant",
            content: errorMessage
          }
        },
        newState: currentState
      };
    }

  } catch (error) {
    console.error(`[HoldSlotHandler] Unexpected error:`, error);
    return {
      toolResponse: {
        toolCallId: toolId,
        result: { success: false, apiLog },
        error: "An unexpected error occurred while trying to hold the appointment slot."
      },
      newState: currentState
    };
  }
}