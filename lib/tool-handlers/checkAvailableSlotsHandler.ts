import { prisma } from "@/lib/prisma";
import { normalizeDateWithAI, findAvailableSlots, generateTimeBucketResponse, generateSlotResponse, TIME_BUCKETS, type TimeBucket } from "@/lib/ai/slotHelper";
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
  const { requestedDate, timeBucket, preferredDaysOfWeek } = toolArguments;
  
  console.log(`[CheckAvailableSlotsHandler] Processing with requestedDate: "${requestedDate}", timeBucket: "${timeBucket}", preferredDaysOfWeek: "${preferredDaysOfWeek}"`);
  
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

    // 1. UNIFIED DATE DETERMINATION LOGIC (respects user preferences in all flows)
    let searchDate: string | null = null;

    // Priority 1: Handle explicit user date request
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
    } 
    // Priority 2: Handle preferred days of week
    else if (preferredDaysOfWeek) {
      try {
        const preferredDays = JSON.parse(preferredDaysOfWeek);
        if (Array.isArray(preferredDays) && preferredDays.length > 0) {
          const dayName = preferredDays[0]; // Taking the first preferred day
          const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayName.toLowerCase());
          
          if (dayIndex !== -1) {
            let searchDateTime = DateTime.now().setZone(practice.timezone || 'America/Chicago');
            
            // Find the next occurrence of the preferred day
            // If today is the preferred day, we'll still look for next occurrence to avoid booking too last minute
            do {
              searchDateTime = searchDateTime.plus({ days: 1 });
            } while (searchDateTime.weekday % 7 !== dayIndex);
            
            searchDate = searchDateTime.toFormat('yyyy-MM-dd');
            console.log(`[CheckAvailableSlotsHandler] Calculated next ${dayName} as: ${searchDate}`);
          } else {
            console.error(`[CheckAvailableSlotsHandler] Invalid day name: ${dayName}`);
          }
        }
      } catch (e) {
        console.error("[CheckAvailableSlotsHandler] Could not parse preferredDaysOfWeek", e);
      }
    }

    // Priority 3: Default to today if no date or preference provided
    if (!searchDate) {
      console.log(`[CheckAvailableSlotsHandler] No specific date preference provided. Using today as default.`);
      searchDate = DateTime.now().setZone(practice.timezone || 'America/Chicago').toFormat('yyyy-MM-dd');
    }

    // 2. DETERMINE SEARCH WINDOW
    const { isUrgent, isImmediateBooking } = currentState.appointmentBooking;
    let searchDays: number;
    
    if (requestedDate) {
      searchDays = 1; // Search only the specific requested date
    } else if (isUrgent || isImmediateBooking) {
      searchDays = 7; // Search 7 days for urgent appointments if no specific date requested
    } else {
      searchDays = 3; // Search 3 days for standard flow if no specific date requested
    }

    // 3. PERFORM THE SEARCH
    const searchResult = await findAvailableSlots(
      currentState.appointmentBooking.typeId,
      {
        id: practice.id,
        nexhealthSubdomain: practice.nexhealthSubdomain!,
        nexhealthLocationId: practice.nexhealthLocationId!,
        timezone: practice.timezone || 'America/Chicago'
      },
      searchDate,
      searchDays,
      timeBucket as TimeBucket
    );

    // 4. SLOTS ARE NOW PRE-FILTERED BY findAvailableSlots
    const filteredSlots = searchResult.foundSlots;

    const spokenName = currentState.appointmentBooking.spokenName || currentState.appointmentBooking.typeName || 'appointment';

    // 4. DECIDE HOW TO RESPOND BASED ON FLOW TYPE
    if (isUrgent || isImmediateBooking) {
      console.log(`[CheckAvailableSlotsHandler] Urgent/Immediate flow activated. isUrgent: ${isUrgent}, isImmediateBooking: ${isImmediateBooking}`);

      // URGENT/IMMEDIATE: Generate response with specific times from filteredSlots
      const aiResponse = await generateSlotResponse(
        { ...searchResult, foundSlots: filteredSlots },
        spokenName,
        practice.timezone || 'America/Chicago'
      );

      // Update conversation state to present specific slots for confirmation
      const newState: ConversationState = {
        ...currentState,
        currentStage: 'AWAITING_SLOT_CONFIRMATION',
        appointmentBooking: {
          ...currentState.appointmentBooking,
          presentedSlots: filteredSlots.map(slot => ({
            time: slot.time,
            operatory_id: slot.operatory_id,
            providerId: slot.providerId
          })),
          nextAvailableDate: searchResult.nextAvailableDate || null
        }
      };

      const toolResponse: VapiToolResult = {
        toolCallId: toolId,
        result: aiResponse
      };

      console.log(`[CheckAvailableSlotsHandler] Urgent flow completed, presented ${filteredSlots.length} slots`);

      return {
        toolResponse,
        newState
      };

    } else {
      // STANDARD: Generate response with time buckets based on filteredSlots
      const availableBuckets: string[] = [];
      const primaryBuckets = ['Morning', 'Afternoon', 'Evening'] as const;
      
      for (const bucket of primaryBuckets) {
        const bucketRange = TIME_BUCKETS[bucket];
        const [startHour, startMinute] = bucketRange.start.split(':').map(Number);
        const [endHour, endMinute] = bucketRange.end.split(':').map(Number);
        
        const hasSlotInBucket = filteredSlots.some(slot => {
          const slotTime = DateTime.fromISO(slot.time);
          const slotHour = slotTime.hour;
          const slotMinute = slotTime.minute;
          
          const slotTimeInMinutes = slotHour * 60 + slotMinute;
          const startTimeInMinutes = startHour * 60 + startMinute;
          const endTimeInMinutes = endHour * 60 + endMinute;
          
          return slotTimeInMinutes >= startTimeInMinutes && slotTimeInMinutes <= endTimeInMinutes;
        });
        
        if (hasSlotInBucket) {
          availableBuckets.push(bucket);
        }
      }

      console.log(`[CheckAvailableSlotsHandler] Found slots in time buckets: ${availableBuckets.join(', ')}`);

      // Generate the day of week for the response
      const searchDateTime = DateTime.fromISO(searchDate, { zone: practice.timezone || 'America/Chicago' });
      const dayOfWeek = searchDateTime.toFormat('cccc'); // e.g., "Thursday"
      
      // Use the time bucket response generator
      const aiResponse = await generateTimeBucketResponse(
        availableBuckets,
        dayOfWeek,
        spokenName
      );

      // Update conversation state - Store ALL filtered slots for later use
      const newState: ConversationState = {
        ...currentState,
        currentStage: 'AWAITING_TIME_BUCKET_SELECTION',
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

      console.log(`[CheckAvailableSlotsHandler] Successfully presented ${availableBuckets.length} time bucket options for ${filteredSlots.length} total slots`);

      return {
        toolResponse,
        newState
      };
    }

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