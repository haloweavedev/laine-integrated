import { prisma } from "@/lib/prisma";
import { matchUserSelectionToSlot } from '@/lib/ai/slotMatcher';
import type { ConversationState, HandlerResult, ApiLog } from "@/types/vapi";

interface UpdateSelectedSlotArgs {
  userSelection: string;
}

export async function handleUpdateSelectedSlot(
  currentState: ConversationState,
  toolArguments: UpdateSelectedSlotArgs,
  toolId: string
): Promise<HandlerResult> {
  const { userSelection } = toolArguments;
  
  // Initialize API log array to capture all external calls
  const apiLog: ApiLog = [];
  
  console.log(`[UpdateSelectedSlotHandler] Processing user selection: "${userSelection}"`);
  console.log(`[UpdateSelectedSlotHandler] Available presented slots:`, currentState.appointmentBooking.presentedSlots);
  
  try {
    // Get practice details for timezone
    const practice = await prisma.practice.findUnique({
      where: { id: currentState.practiceId },
      select: { timezone: true }
    });

    const practiceTimezone = practice?.timezone || 'America/Chicago';
    
    // Create a copy of the current state for modifications
    const newState = { ...currentState };

    // Use the AI slot matcher to find the correct slot
    const matchedSlot = await matchUserSelectionToSlot(
      userSelection,
      currentState.appointmentBooking.presentedSlots || [],
      practiceTimezone
    );

    if (matchedSlot) {
      // Update the state with the selected slot
      newState.appointmentBooking = {
        ...newState.appointmentBooking,
        selectedSlot: matchedSlot
      };
      
      console.log(`[UpdateSelectedSlotHandler] Successfully matched and saved slot: ${matchedSlot.time}`);
    } else {
      console.log(`[UpdateSelectedSlotHandler] Could not match user selection to any presented slot`);
    }

    // Return silently - no message, no result, just the updated state
    return {
      newState: newState,
      toolResponse: { 
        toolCallId: toolId,
        result: { apiLog: apiLog }
      }
    };

  } catch (error) {
    console.error(`[UpdateSelectedSlotHandler] Error processing slot selection:`, error);
    
    // Even on error, return silently to maintain conversation flow
    return {
      newState: currentState,
      toolResponse: { 
        toolCallId: toolId,
        result: { apiLog: apiLog }
      }
    };
  }
} 