import { prisma } from "@/lib/prisma";
import { normalizeDateWithAI, findAvailableSlots, generateSlotResponse, TIME_BUCKETS, type TimeBucket } from "@/lib/ai/slotHelper";
import { DateTime } from "luxon";
import type { ConversationState, VapiToolResult } from "@/types/vapi";

interface CheckAvailableSlotsArgs {
  preferredDaysOfWeek?: string;
  timeBucket?: string;
  requestedDate?: string;
}

interface HandlerResult {
  toolResponse: VapiToolResult;
  newState: ConversationState;
}

export async function handleCheckAvailableSlots(
  currentState: ConversationState,
  toolArguments: CheckAvailableSlotsArgs,
  toolId: string
): Promise<HandlerResult> {
  const { requestedDate, timeBucket } = toolArguments;
  
  console.log(`[CheckAvailableSlotsHandler] Processing with requestedDate: "${requestedDate}", timeBucket: "${timeBucket}"`);
  
  try {
    if (!currentState.practiceId) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Practice configuration not found."
        },
        newState: currentState
      };
    }

    if (!currentState.appointmentBooking.typeId) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "No appointment type identified yet. Please identify an appointment type first."
        },
        newState: currentState
      };
    }

    // Fetch practice details
    const practice = await prisma.practice.findUnique({
      where: { id: currentState.practiceId },
      select: {
        id: true,
        timezone: true,
        nexhealthSubdomain: true,
        nexhealthLocationId: true,
      }
    });

    if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Practice NexHealth configuration not found."
        },
        newState: currentState
      };
    }

    let searchDate: string | null = null;

    // Handle explicit user date request
    if (requestedDate) {
      console.log(`[CheckAvailableSlotsHandler] User provided a specific date: "${requestedDate}". Normalizing...`);
      searchDate = await normalizeDateWithAI(requestedDate, practice.timezone || 'America/Chicago');
      if (!searchDate) {
        return {
          toolResponse: {
            toolCallId: toolId,
            result: `I couldn't quite understand the date "${requestedDate}". Could you try saying it a different way?`
          },
          newState: currentState
        };
      }
      console.log(`[CheckAvailableSlotsHandler] Normalized date to: ${searchDate}`);
    } else {
      // Default to today for immediate check
      console.log(`[CheckAvailableSlotsHandler] No date provided. Using today for immediate slot check.`);
      searchDate = DateTime.now().setZone(practice.timezone || 'America/Chicago').toFormat('yyyy-MM-dd');
    }

    // Perform the search
    const searchDays = requestedDate ? 1 : 3; // Search 1 day if specific, 3 if immediate
    
    const searchResult = await findAvailableSlots(
      currentState.appointmentBooking.typeId,
      {
        id: practice.id,
        nexhealthSubdomain: practice.nexhealthSubdomain!,
        nexhealthLocationId: practice.nexhealthLocationId!,
        timezone: practice.timezone || 'America/Chicago'
      },
      searchDate,
      searchDays
    );

    let filteredSlots = searchResult.foundSlots;

    // === FIX THE CRITICAL BUG: Apply time preference filtering ===
    if (timeBucket && timeBucket !== 'AllDay' && TIME_BUCKETS[timeBucket as TimeBucket]) {
      const timeBucketRange = TIME_BUCKETS[timeBucket as TimeBucket];
      const [startHour, startMinute] = timeBucketRange.start.split(':').map(Number);
      const [endHour, endMinute] = timeBucketRange.end.split(':').map(Number);
      
      console.log(`[CheckAvailableSlotsHandler] Filtering slots for ${timeBucket} preference (${timeBucketRange.start} - ${timeBucketRange.end})`);
      
      filteredSlots = searchResult.foundSlots.filter(slot => {
        const slotTime = DateTime.fromISO(slot.time);
        const slotHour = slotTime.hour;
        const slotMinute = slotTime.minute;
        
        // Check if slot time falls within the time bucket
        const slotTimeInMinutes = slotHour * 60 + slotMinute;
        const startTimeInMinutes = startHour * 60 + startMinute;
        const endTimeInMinutes = endHour * 60 + endMinute;
        
        const withinRange = slotTimeInMinutes >= startTimeInMinutes && slotTimeInMinutes <= endTimeInMinutes;
        
        if (!withinRange) {
          console.log(`[CheckAvailableSlotsHandler] Filtered out slot ${slot.time} (${slotHour}:${slotMinute.toString().padStart(2, '0')}) - outside ${timeBucket} range`);
        }
        
        return withinRange;
      });
      
      console.log(`[CheckAvailableSlotsHandler] Filtered from ${searchResult.foundSlots.length} to ${filteredSlots.length} slots for ${timeBucket} preference`);
    }

    // Generate response with filtered slots
    const modifiedSearchResult = {
      foundSlots: filteredSlots,
      nextAvailableDate: searchResult.nextAvailableDate
    };

    const spokenName = currentState.appointmentBooking.spokenName || currentState.appointmentBooking.typeName || 'appointment';
    const aiResponse = await generateSlotResponse(
      modifiedSearchResult,
      spokenName,
      practice.timezone || 'America/Chicago'
    );

    // Update conversation state
    const newState: ConversationState = {
      ...currentState,
      currentStage: 'PRESENTING_SLOTS',
      appointmentBooking: {
        ...currentState.appointmentBooking,
        presentedSlots: filteredSlots.map(slot => ({
          time: slot.time,
          operatory_id: slot.operatory_id,
          providerId: slot.providerId
        })),
        nextAvailableDate: searchResult.nextAvailableDate || null,
        lastTimePreference: timeBucket as 'Morning' | 'Afternoon' | 'Evening' | 'Any' || 'Any'
      }
    };

    const toolResponse: VapiToolResult = {
      toolCallId: toolId,
      result: aiResponse
    };

    console.log(`[CheckAvailableSlotsHandler] Successfully found ${filteredSlots.length} slots with ${timeBucket || 'no'} time preference`);

    return {
      toolResponse,
      newState
    };

  } catch (error) {
    console.error(`[CheckAvailableSlotsHandler] Error checking available slots:`, error);
    return {
      toolResponse: {
        toolCallId: toolId,
        error: "Error checking available appointment slots."
      },
      newState: currentState
    };
  }
} 