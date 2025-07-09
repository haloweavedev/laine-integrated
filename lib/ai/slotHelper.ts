import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { DateTime } from "luxon";
import type { CoreMessage } from "ai";

/**
 * Defines the time ranges for different parts of the day.
 * Used to filter appointment slots based on user preference.
 * Note: 'Morning' and 'Afternoon' are broad, while others are more specific.
 * 'Midday' overlaps with both Morning and Afternoon to catch appointments around noon.
 */
export const TIME_BUCKETS = {
  Early:     { start: "05:00", end: "08:30" },
  Morning:   { start: "05:00", end: "12:00" },
  Midday:    { start: "10:00", end: "15:00" },
  Afternoon: { start: "12:00", end: "17:00" },
  Evening:   { start: "15:30", end: "20:00" },
  Late:      { start: "17:00", end: "22:00" },
  AllDay:    { start: "05:00", end: "22:00" }
};

export type TimeBucket = keyof typeof TIME_BUCKETS;

/**
 * Normalize a date query using AI to convert natural language dates into YYYY-MM-DD format
 */
export async function normalizeDateWithAI(
  dateQuery: string, 
  practiceTimezone: string
): Promise<string | null> {
  try {
    const now = DateTime.now().setZone(practiceTimezone);
    const systemPromptContent = `You are a highly specialized date parsing AI. Your only task is to convert a user's spoken date query into a strict 'YYYY-MM-DD' format.
    
    Current Context:
    - Today's date is: ${now.toFormat('EEEE, MMMM d, yyyy')} (${now.toFormat('yyyy-MM-dd')}).
    - The user is in the timezone: ${practiceTimezone}.
    
    Interpretation Rules:
    1.  **Assume Current Year:** If no year is specified (e.g., "July 11"), assume the current year (${now.year}). If that date has already passed, assume the following year.
    2.  **Relative Dates:** Interpret "today", "tomorrow", "day after tomorrow" based on the current date.
    3.  **"Next" Keyword (CRITICAL):**
        - If today is Wednesday (weekday 3) and the user says "next Tuesday" (weekday 2), they mean the upcoming Tuesday of the *next* week.
        - If today is Monday (weekday 1) and the user says "next Wednesday" (weekday 3), they mean the upcoming Wednesday of the *same* week.
        - "This Friday" always means the Friday of the current week.
    4.  **Ambiguity:** If a query is truly ambiguous (e.g., "the 10th" without a month) or not a date, you MUST return 'INVALID_DATE'.
    
    Examples (Assuming today is Wednesday, 2025-07-09):
    - "tomorrow" -> "2025-07-10"
    - "July 11" -> "2025-07-11"
    - "this Friday" -> "2025-07-11"
    - "next Wednesday" -> "2025-07-16"
    - "next Tuesday" -> "2025-07-15"
    - "a week from today" -> "2025-07-16"
    - "July 10th" -> "2025-07-10"
    - "the day after tomorrow" -> "2025-07-11"
    - "December 25" -> "2025-12-25"
    - "March 1" -> "2026-03-01" (if we're past March 1, 2025)
    
    Output Format (CRITICAL):
    - Your entire response MUST be ONLY the 'YYYY-MM-DD' string.
    - If the query is invalid or cannot be resolved, your entire response MUST be the exact string "INVALID_DATE".
    - Do NOT add any other words, explanations, or formatting.`;

    const userPromptContent = `User Query: "${dateQuery}"

Normalized Date (YYYY-MM-DD or INVALID_DATE):`;

    const messages: CoreMessage[] = [
      { role: 'system', content: systemPromptContent },
      { role: 'user', content: userPromptContent }
    ];

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0,
      maxTokens: 50
    });

    const normalizedDate = text.trim();
    
    if (!normalizedDate || normalizedDate === "INVALID_DATE") {
      console.log(`[Date Normalization] Could not parse date: "${dateQuery}"`);
      return null;
    }

    // Validate the returned date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(normalizedDate)) {
      console.error(`[Date Normalization] AI returned invalid format: "${normalizedDate}"`);
      return null;
    }

    console.log(`[Date Normalization] Successfully parsed "${dateQuery}" → "${normalizedDate}"`);
    return normalizedDate;
  } catch (error) {
    console.error('[Date Normalization] Error:', error);
    return null;
  }
}

/**
 * Generate a natural spoken message presenting available slots or alternatives
 * @deprecated This function will be removed in a future refactor phase as we move to preference-based scheduling
 */
export async function generateSlotResponseMessage(
  appointmentTypeName: string,
  normalizedDate: string,
  availableSlots: string[],
  timePreference?: string
): Promise<string> {
  try {
    console.log(`[Slot Response] Generating message for ${appointmentTypeName} on ${normalizedDate}, ${availableSlots.length} slots available`);

    // Format the date for natural speech
    const dateObj = DateTime.fromISO(normalizedDate);
    const friendlyDate = dateObj.toFormat('EEEE, MMMM dd'); // e.g., "Monday, December 23"
    
    const timePreferenceText = timePreference ? ` ${timePreference}` : '';
    
    let prompt: string;

    if (availableSlots.length > 0) {
      const slotsList = availableSlots.slice(0, 3).join(', '); // Limit to first 3 slots
      const hasMoreSlots = availableSlots.length > 3;
      
      prompt = `You are Laine, a friendly dental assistant. Generate a natural response offering available appointment slots.

Appointment Type: ${appointmentTypeName}
Date: ${friendlyDate}
Time Preference: ${timePreference || 'none specified'}
Available slots: ${slotsList}${hasMoreSlots ? ' (and more)' : ''}

Create a natural, conversational response that:
1. Confirms the appointment type and date
2. Presents the available time slots (up to 3)
3. Asks if any of those work for the patient
4. Be warm and helpful

Keep it concise and natural. Return only the response text.

Example format: "Great! For your ${appointmentTypeName} on ${friendlyDate}${timePreferenceText}, I have ${slotsList} available. Would any of those work for you?"`;
    } else {
      prompt = `You are Laine, a friendly dental assistant. Generate a natural response when no appointment slots are available.

Appointment Type: ${appointmentTypeName}
Date: ${friendlyDate}
Time Preference: ${timePreference || 'none specified'}

Create a natural, apologetic response that:
1. Acknowledges the specific appointment type and date requested
2. Mentions if there was a time preference
3. Suggests trying a different date or removing time restrictions
4. Be empathetic and helpful

Keep it concise and natural. Return only the response text.

Example format: "I'm sorry, I don't have any available slots for your ${appointmentTypeName} on ${friendlyDate}${timePreferenceText}. Would you like to try a different date, or perhaps I can check for any availability that day without a specific time preference?"`;
    }

    const messages: CoreMessage[] = [
      {
        role: "user",
        content: prompt
      }
    ];

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.3,
      maxTokens: 150
    });

    const message = text.trim();
    
    if (!message) {
      // Fallback message
      if (availableSlots.length > 0) {
        const slotsList = availableSlots.slice(0, 3).join(', ');
        return `For your ${appointmentTypeName} on ${friendlyDate}, I have ${slotsList} available. Would any of those work for you?`;
      } else {
        return `I'm sorry, I don't have any available slots for your ${appointmentTypeName} on ${friendlyDate}. Would you like to try a different date?`;
      }
    }

    console.log(`[Slot Response] Generated message: "${message}"`);
    return message;
  } catch (error) {
    console.error('[Slot Response] Error generating message:', error);
    
    // Fallback message
    if (availableSlots.length > 0) {
      const slotsList = availableSlots.slice(0, 3).join(', ');
      return `For your ${appointmentTypeName}, I have ${slotsList} available. Would any of those work for you?`;
    } else {
      return `I'm sorry, I don't have any available slots for your ${appointmentTypeName} on that date. Would you like to try a different date?`;
    }
  }
}

/**
 * Get slot search parameters for a specific appointment type from the database
 * @param appointmentTypeId NexHealth appointment type ID 
 * @param practiceId Practice ID
 * @returns Object with duration, providerIds, and operatoryIds needed for slot search
 */
export async function getSlotSearchParams(
  appointmentTypeId: string,
  practiceId: string
): Promise<{ duration: number; providerIds: string[]; operatoryIds: string[] }> {
  const { prisma } = await import("@/lib/prisma");
  
  // Fetch the AppointmentType to get its duration
  const appointmentType = await prisma.appointmentType.findFirst({
    where: {
      nexhealthAppointmentTypeId: appointmentTypeId,
      practiceId: practiceId
    },
    select: {
      duration: true
    }
  });

  if (!appointmentType) {
    throw new Error(`Appointment type with ID ${appointmentTypeId} not found for practice ${practiceId}`);
  }

  // Fetch all active SavedProviders that accept this appointment type
  const savedProviders = await prisma.savedProvider.findMany({
    where: {
      practiceId: practiceId,
      isActive: true,
      acceptedAppointmentTypes: {
        some: {
          appointmentType: {
            nexhealthAppointmentTypeId: appointmentTypeId
          }
        }
      }
    },
    include: {
      provider: true,
      assignedOperatories: {
        include: {
          savedOperatory: true
        }
      }
    }
  });

  if (savedProviders.length === 0) {
    throw new Error("No active providers are configured for this appointment type.");
  }

  // Collect unique NexHealth provider IDs
  const providerIds = Array.from(
    new Set(savedProviders.map(sp => sp.provider.nexhealthProviderId))
  );

  // Collect unique NexHealth operatory IDs from provider assignments
  const operatoryIds = Array.from(
    new Set(
      savedProviders
        .flatMap(sp => sp.assignedOperatories)
        .map(assignment => assignment.savedOperatory.nexhealthOperatoryId)
    )
  );

  if (operatoryIds.length === 0) {
    throw new Error("No active operatories are assigned to the providers for this appointment type.");
  }

  return {
    duration: appointmentType.duration,
    providerIds,
    operatoryIds
  };
}

// Interface for individual slot data
interface SlotData {
  time: string;
  operatory_id?: number;
  providerId: number;
  locationId: number;
}

// Interface for provider data from NexHealth API
interface ProviderSlotData {
  pid: number;
  lid: number;
  slots: Array<{
    time: string;
    operatory_id?: number;
  }>;
}

// Interface for NexHealth API response
interface NexHealthSlotsResponse {
  data: ProviderSlotData[];
  next_available_date?: string;
}

/**
 * Find available slots for an appointment type
 * @param appointmentTypeId NexHealth appointment type ID
 * @param practice Practice details with NexHealth configuration
 * @param startDate Starting date to search from in YYYY-MM-DD format
 * @param searchDays Number of days to search
 * @returns Object with found slots and next available date if no slots found
 */
export async function findAvailableSlots(
  appointmentTypeId: string,
  practice: {
    id: string;
    nexhealthSubdomain: string;
    nexhealthLocationId: string;
    timezone: string;
  },
  startDate: string,
  searchDays: number,
  timeBucket?: TimeBucket
): Promise<{ foundSlots: SlotData[]; nextAvailableDate: string | null }> {
  const { fetchNexhealthAPI } = await import("@/lib/nexhealth");
  
  // Get slot search parameters
  const { duration, providerIds, operatoryIds } = await getSlotSearchParams(
    appointmentTypeId,
    practice.id
  );

  console.log(`[Slot Search] Searching for ${duration}-minute slots with providers: ${providerIds.join(', ')} and operatories: ${operatoryIds.join(', ')}`);

  // Use practice timezone, default to America/Chicago if not set
  const timezone = practice.timezone || 'America/Chicago';
  
  // Generate search dates based on startDate and searchDays
  const searchDates: string[] = [];
  const startDateTime = DateTime.fromISO(startDate, { zone: timezone });
  
  for (let i = 0; i < searchDays; i++) {
    searchDates.push(startDateTime.plus({ days: i }).toFormat('yyyy-MM-dd'));
  }

  console.log(`[Slot Search] Searching dates: ${searchDates.join(', ')} in timezone ${timezone}`);

  const foundSlots: SlotData[] = [];
  let nextAvailableDate: string | null = null;

  // Search through the specified date range
  for (let i = 0; i < searchDates.length; i++) {
    const searchDate = searchDates[i];
    
    try {
      console.log(`[Slot Search] Searching date ${searchDate} (day ${i + 1}/${searchDates.length})`);
      
      // Construct API parameters for NexHealth appointment_slots endpoint
      const params: Record<string, string | string[]> = {
        start_date: searchDate,
        days: '1',
        'lids[]': practice.nexhealthLocationId,
        slot_length: duration.toString()
      };

      // Add provider IDs as array parameters
      params['pids[]'] = providerIds;
      
      // Add operatory IDs as array parameters  
      params['operatory_ids[]'] = operatoryIds;

      // --- BEGIN: New logging block ---
      try {
        // Use URLSearchParams for robust and correct URL encoding
        const queryParams = new URLSearchParams();
        for (const key in params) {
          const value = params[key];
          if (Array.isArray(value)) {
            value.forEach(item => queryParams.append(key, item));
          } else {
            queryParams.append(key, value);
          }
        }
        
        // Construct the full URL for logging purposes
        const fullRequestUrl = `https://api.nexhealth.com/v2/appointment_slots?subdomain=${practice.nexhealthSubdomain}&${queryParams.toString()}`;
        
        console.log(`[NexHealth API Request] GET ${fullRequestUrl}`);

      } catch (logError) {
        console.error("[NexHealth API Request] Error constructing log URL:", logError);
      }
      // --- END: New logging block ---

      // Call NexHealth API
      const response = await fetchNexhealthAPI(
        '/appointment_slots',
        practice.nexhealthSubdomain,
        params
      ) as NexHealthSlotsResponse;

      console.log(`[Slot Search] API response for ${searchDate}:`, JSON.stringify(response, null, 2));

      // Process the response data
      if (response.data && Array.isArray(response.data)) {
        // Collect all slots from all providers for this date
        const daySlots = response.data.flatMap((providerData: ProviderSlotData) => {
          if (providerData.slots && Array.isArray(providerData.slots)) {
            return providerData.slots.map((slot) => ({
              ...slot,
              providerId: providerData.pid,
              locationId: providerData.lid
            }));
          }
          return [];
        });

        // Filter out slots that overlap with lunch break (1:00 PM - 2:00 PM)
        const filteredDaySlots = daySlots.filter((slot) => {
          try {
            // Parse the slot time to get the start time
            const slotStartTime = DateTime.fromISO(slot.time).setZone(timezone);
            const slotStartHour = slotStartTime.hour;
            const slotStartMinute = slotStartTime.minute;
            
            // Calculate the slot end time by adding duration
            const slotEndTime = slotStartTime.plus({ minutes: duration });
            const slotEndHour = slotEndTime.hour;
            const slotEndMinute = slotEndTime.minute;
            
            // Define lunch break: 1:00 PM (13:00) to 2:00 PM (14:00)
            const lunchStartHour = 13;
            const lunchEndHour = 14;
            
            // Check if slot overlaps with lunch break
            const slotStartsInLunch = (slotStartHour === lunchStartHour && slotStartMinute >= 0) || 
                                     (slotStartHour > lunchStartHour && slotStartHour < lunchEndHour);
            
            const slotEndsInLunch = (slotEndHour === lunchStartHour && slotEndMinute > 0) || 
                                   (slotEndHour > lunchStartHour && slotEndHour <= lunchEndHour);
            
            const slotSpansLunch = slotStartHour < lunchStartHour && slotEndHour > lunchEndHour;
            
            const isLunchConflict = slotStartsInLunch || slotEndsInLunch || slotSpansLunch;
            
            if (isLunchConflict) {
              console.log(`[Lunch Filter] Discarded slot at ${slot.time} - conflicts with lunch break (${slotStartTime.toFormat('h:mm a')} - ${slotEndTime.toFormat('h:mm a')})`);
              return false;
            }
            
            return true;
          } catch (error) {
            console.error(`[Lunch Filter] Error parsing slot time ${slot.time}:`, error);
            // Keep the slot if we can't parse it rather than losing potentially valid slots
            return true;
          }
        });

        console.log(`[Lunch Filter] Filtered ${daySlots.length} slots to ${filteredDaySlots.length} slots after removing lunch conflicts on ${searchDate}`);

        // Apply time bucket filter if specified
        let finalDaySlots = filteredDaySlots;
        if (timeBucket && timeBucket !== 'AllDay' && TIME_BUCKETS[timeBucket]) {
          const timeBucketRange = TIME_BUCKETS[timeBucket];
          const [startHour, startMinute] = timeBucketRange.start.split(':').map(Number);
          const [endHour, endMinute] = timeBucketRange.end.split(':').map(Number);
          
          console.log(`[Time Bucket Filter] Filtering slots for ${timeBucket} preference (${timeBucketRange.start} - ${timeBucketRange.end}) on ${searchDate}`);
          
          finalDaySlots = filteredDaySlots.filter(slot => {
            const slotTime = DateTime.fromISO(slot.time);
            const slotHour = slotTime.hour;
            const slotMinute = slotTime.minute;
            
            // Check if slot time falls within the time bucket
            const slotTimeInMinutes = slotHour * 60 + slotMinute;
            const startTimeInMinutes = startHour * 60 + startMinute;
            const endTimeInMinutes = endHour * 60 + endMinute;
            
            const withinRange = slotTimeInMinutes >= startTimeInMinutes && slotTimeInMinutes <= endTimeInMinutes;
            
            if (!withinRange) {
              console.log(`[Time Bucket Filter] Filtered out slot ${slot.time} (${slotHour}:${slotMinute.toString().padStart(2, '0')}) - outside ${timeBucket} range`);
            }
            
            return withinRange;
          });
          
          console.log(`[Time Bucket Filter] Filtered from ${filteredDaySlots.length} to ${finalDaySlots.length} slots for ${timeBucket} preference on ${searchDate}`);
        }

        foundSlots.push(...finalDaySlots);
        console.log(`[Slot Search] Found ${finalDaySlots.length} slots on ${searchDate} (after all filtering), total so far: ${foundSlots.length}`);

        // If we have 2 or more slots, we can break early
        if (foundSlots.length >= 2) {
          console.log(`[Slot Search] Found sufficient slots (${foundSlots.length}), stopping search`);
          break;
        }
      }

      // Store next_available_date from the last API response if present
      if (response.next_available_date) {
        nextAvailableDate = response.next_available_date;
        console.log(`[Slot Search] Found next_available_date: ${nextAvailableDate}`);
      }

    } catch (error) {
      console.error(`[Slot Search] Error searching ${searchDate}:`, error);
      // Continue to next date on error
    }
  }

  // Sort slots chronologically to ensure earliest times are offered first
  foundSlots.sort((a, b) => a.time.localeCompare(b.time));
  console.log('[Slot Search] Sorted slots chronologically.');

  // Limit to first 2-3 slots for response
  const limitedSlots = foundSlots.slice(0, 3);
  
  console.log(`[Slot Search] Final result: ${limitedSlots.length} slots found, next available: ${nextAvailableDate}`);

  return {
    foundSlots: limitedSlots,
    nextAvailableDate
  };
}

/**
 * Generate a natural AI response for slot checking results
 * @param searchResult The result from findAvailableSlots
 * @param spokenName The natural name of the appointment type for conversation
 * @param practiceTimezone The practice's timezone for proper time formatting
 * @returns Generated AI response message
 */
export async function generateSlotResponse(
  searchResult: { foundSlots: SlotData[]; nextAvailableDate: string | null },
  spokenName: string,
  practiceTimezone: string
): Promise<string> {
  const { generateText } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");

  if (searchResult.foundSlots.length > 0) {
    // De-duplicate slots to ensure only unique time strings are presented to users
    const uniqueSlots = searchResult.foundSlots.filter(
      (slot, index, self) =>
        index ===
        self.findIndex((s) => 
          DateTime.fromISO(s.time).setZone(practiceTimezone).toFormat("cccc, MMMM d 'at' h:mm a") === 
          DateTime.fromISO(slot.time).setZone(practiceTimezone).toFormat("cccc, MMMM d 'at' h:mm a")
        )
    );
    
    const formattedSlots = uniqueSlots.slice(0, 2).map(slot => {
        const slotDateTime = DateTime.fromISO(slot.time).setZone(practiceTimezone);
        // Create a full, friendly string: "Wednesday, July 9th at 7:00 AM"
        return slotDateTime.toFormat("cccc, MMMM d 'at' h:mm a");
    }).join(' or ');

    const userPrompt = `You are an AI response generator for a voice assistant named Laine. Your only job is to create a SINGLE, fluid, natural-sounding sentence offering appointment slots.

Patient needs a: "${spokenName}"
Available slots are: "${formattedSlots}"

Example Output: "Okay, for your ${spokenName}, I have openings on ${formattedSlots}. Would one of those work for you?"

Your turn. Generate the single, fluid, spoken response for Laine:`;

    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.3,
        maxTokens: 100
      });
      return text.trim() || `For your ${spokenName}, I have openings on ${formattedSlots}. Would either of those work for you?`;
    } catch (error) {
      console.error('[Slot Response] Error generating AI response:', error);
      return `For your ${spokenName}, I have openings on ${formattedSlots}. Would either of those work for you?`;
    }

  } else if (searchResult.nextAvailableDate) {
    // Format the next available date into a friendly format
    let friendlyDate: string;
    try {
      const nextDate = DateTime.fromISO(searchResult.nextAvailableDate).setZone(practiceTimezone);
      friendlyDate = nextDate.toFormat('EEEE, MMMM d'); // e.g., "Wednesday, July 9th"
    } catch (error) {
      console.error('[Slot Response] Error formatting next available date:', error);
      friendlyDate = searchResult.nextAvailableDate;
    }

    const systemPrompt = `You are an AI response generator. Your ONLY job is to create a SINGLE, fluid, natural-sounding sentence for a voice assistant named Laine.

**CRITICAL RULES:**
1.  **ONE UNBROKEN SENTENCE:** Your entire output must be a single sentence.
2.  **NO FILLER:** Do not add "Just a sec" or "Give me a moment".

**Task:** For the patient's request for a '${spokenName}', there are no openings in the next few days. The next available date is ${friendlyDate}. Inform them and ask if they'd like you to check for times on that day.

**Example Output:** "I'm sorry, we don't have any openings for your ${spokenName} in the next few days, but the next available date is ${friendlyDate}. Would you like me to check for times on that day?"`;

    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [
          { role: 'system', content: systemPrompt }
        ],
        temperature: 0.3,
        maxTokens: 120
      });

      return text.trim() || `I'm sorry, we don't have any openings for your ${spokenName} in the next few days. The next available date is ${friendlyDate}. Would you like me to check for times on that day?`;
    } catch (error) {
      console.error('[Slot Response] Error generating AI response for next available:', error);
      return `I'm sorry, we don't have any openings for your ${spokenName} in the next few days. The next available date is ${friendlyDate}. Would you like me to check for times on that day?`;
    }

  } else {
    // No slots found and no next available date
    const systemPrompt = `You are an AI response generator. Your ONLY job is to create a SINGLE, fluid, natural-sounding sentence for a voice assistant named Laine.

**CRITICAL RULES:**
1.  **ONE UNBROKEN SENTENCE:** Your entire output must be a single sentence.
2.  **NO FILLER:** Do not add "Just a sec" or "Give me a moment".

**Task:** For the patient's request for a '${spokenName}', you are fully booked for the near future. Apologize and suggest that a staff member will call them back to find a time.

**Example Output:** "I'm sorry, it looks like we're fully booked for your ${spokenName} in the near future, so let me have one of our staff members call you back to find a time that works."`;

    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [
          { role: 'system', content: systemPrompt }
        ],
        temperature: 0.3,
        maxTokens: 100
      });

      return text.trim() || `I'm sorry, it looks like we're fully booked for your ${spokenName} in the near future. Let me have one of our staff members call you back to find a time that works.`;
    } catch (error) {
      console.error('[Slot Response] Error generating AI response for no availability:', error);
      return `I'm sorry, it looks like we're fully booked for your ${spokenName} in the near future. Let me have one of our staff members call you back to find a time that works.`;
    }
  }
}

/**
 * Generate a natural AI response offering time buckets instead of specific slots
 * @param availableBuckets Array of time bucket names that have availability
 * @param dayOfWeek The day being offered (e.g., "Thursday") 
 * @param spokenName The natural name of the appointment type
 * @returns Generated AI response offering time bucket choices
 */
export async function generateTimeBucketResponse(
  availableBuckets: string[],
  dayOfWeek: string,
  spokenName: string
): Promise<string> {
  if (availableBuckets.length === 0) {
    return `I'm sorry, but I couldn't find any available times for your ${spokenName} on ${dayOfWeek}. Would you like to try another day?`;
  }

  const bucketList = availableBuckets.join(' or ');
  const prompt = `You are an AI response generator. Your only job is to create a SINGLE, fluid, natural-sounding sentence offering time-of-day options.

Context:
- Appointment Type: "${spokenName}"
- Day: "${dayOfWeek}"
- Available Time Windows: "${bucketList}"

Example Output: "Okay, for your ${spokenName} on ${dayOfWeek}, I have openings in the ${bucketList}. Which would you prefer?"

Your turn. Generate the single, fluid, spoken response for Laine:`;
  
  try {
    const { generateText } = await import("ai");
    const { openai } = await import("@ai-sdk/openai");
    
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      maxTokens: 100
    });
    
    return text.trim() || `For your ${spokenName} on ${dayOfWeek}, I have openings in the ${bucketList}. Which would you prefer?`;
  } catch (error) {
    console.error('[Time Bucket Response] Error generating AI response:', error);
    return `For your ${spokenName} on ${dayOfWeek}, I have openings in the ${bucketList}. Which would you prefer?`;
  }
}

 