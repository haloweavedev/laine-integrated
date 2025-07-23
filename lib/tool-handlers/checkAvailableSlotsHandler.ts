import { prisma } from "@/lib/prisma";
import { normalizeDateWithAI, findAvailableSlots, generateTimeBucketResponse, generateSlotResponse, TIME_BUCKETS, type TimeBucket } from "@/lib/ai/slotHelper";
import { DateTime } from "luxon";
import type { ConversationState, HandlerResult, ApiLog } from "@/types/vapi";

interface CheckAvailableSlotsArgs {
  preferredDaysOfWeek?: string;
  timeBucket?: string;
  requestedDate?: string;
}

export async function handleCheckAvailableSlots(
  currentState: ConversationState,
  toolArguments: CheckAvailableSlotsArgs,
  toolId: string
): Promise<HandlerResult> {
  const { requestedDate, timeBucket, preferredDaysOfWeek } = toolArguments;
  
  // Initialize API log array to capture all external calls
  const apiLog: ApiLog = [];
  
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
          error: "Error: I must know the reason for the visit before checking for appointments. I need to use the findAppointmentType tool first."
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
    
    // Decide whether to present specific slots or time buckets
    const shouldPresentSpecificSlots = (isUrgent || isImmediateBooking) || timeBucket;

    if (shouldPresentSpecificSlots) {
      console.log(`[CheckAvailableSlotsHandler] Presenting specific slots. isUrgent: ${isUrgent}, isImmediateBooking: ${isImmediateBooking}, timeBucket provided: ${!!timeBucket}`);

      const aiResponse = await generateSlotResponse(
        searchResult, // searchResult already contains the pre-filtered slots
        spokenName,
        practice.timezone || 'America/Chicago'
      );

      // Create new state with slots data
      const newState = { ...currentState };
      newState.appointmentBooking = {
        ...newState.appointmentBooking,
        presentedSlots: searchResult.foundSlots,
        nextAvailableDate: searchResult.nextAvailableDate || null
      };

      return {
        newState: newState,
        toolResponse: {
          toolCallId: toolId,
          result: { // Structured data payload
            foundSlots: searchResult.foundSlots,
            nextAvailableDate: searchResult.nextAvailableDate || null,
            apiLog: apiLog
          },
          message: { // High-fidelity message
            type: "request-complete",
            role: "assistant",
            content: aiResponse // The AI-generated response from generateSlotResponse
          }
        }
      };

    } else {
      // STANDARD FLOW - First pass, present time buckets
      console.log('[CheckAvailableSlotsHandler] Presenting time buckets for standard flow.');
      
      // Generate response with time buckets based on filteredSlots
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

      console.log(`[CheckAvailableSlotsHandler] Successfully presented ${availableBuckets.length} time bucket options for ${filteredSlots.length} total slots`);

      // Create new state with slots data
      const newState = { ...currentState };
      newState.appointmentBooking = {
        ...newState.appointmentBooking,
        presentedSlots: filteredSlots,
        nextAvailableDate: searchResult.nextAvailableDate || null
      };

      return {
        newState: newState,
        toolResponse: {
          toolCallId: toolId,
          result: { // Structured data payload
            foundSlots: filteredSlots, // Note: we return all filtered slots here
            nextAvailableDate: searchResult.nextAvailableDate || null,
            apiLog: apiLog
          },
          message: { // High-fidelity message
            type: "request-complete",
            role: "assistant",
            content: aiResponse // The AI-generated response from generateTimeBucketResponse
          }
        }
      };
    }

  } catch (error) {
    console.error(`[CheckAvailableSlotsHandler] Error checking available slots:`, error);
    return {
      toolResponse: {
        toolCallId: toolId,
        result: { apiLog: apiLog },
        error: "Error checking available appointment slots."
      },
      newState: currentState
    };
  }
} 