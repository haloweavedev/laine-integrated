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
    const systemPromptContent = `You are a date parsing AI. Your only task is to convert a user's spoken date query into a strict 'YYYY-MM-DD' format. The user is in the 'America/Chicago' timezone.

    Today's date is ${now.toFormat('yyyy-MM-dd')}.

    - Interpret "today" as ${now.toFormat('yyyy-MM-dd')}.
    - Interpret "tomorrow" as ${now.plus({ days: 1 }).toFormat('yyyy-MM-dd')}.
    - If the user provides a date like "July 23rd" and that date has already passed this year, assume they mean next year.
    - If a query is ambiguous or not a date, you MUST return 'INVALID_DATE'.

    Your entire response MUST be ONLY the 'YYYY-MM-DD' string or "INVALID_DATE". Do not add any other words.`;

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

  // 1. Fetch the AppointmentType and include all related active providers and their operatories
  const appointmentType = await prisma.appointmentType.findFirst({
    where: {
      nexhealthAppointmentTypeId: appointmentTypeId,
      practiceId: practiceId,
    },
    include: {
      acceptedByProviders: { // This is the join table
        where: {
          savedProvider: {
            isActive: true, // Filter for active providers
          },
        },
        include: {
          savedProvider: {
            include: {
              provider: true, // Get the provider details (for the ID)
              assignedOperatories: { // Get the assigned operatories for this provider
                where: {
                  savedOperatory: {
                    isActive: true, // Filter for active operatories
                  },
                },
                include: {
                  savedOperatory: true, // Get the operatory details (for the ID)
                },
              },
            },
          },
        },
      },
    },
  });

  if (!appointmentType) {
    throw new Error(`Configuration Error: Appointment type with ID ${appointmentTypeId} not found for practice ${practiceId}.`);
  }

  const activeProviders = appointmentType.acceptedByProviders.map(
    (p) => p.savedProvider
  );

  if (activeProviders.length === 0) {
    throw new Error(`Configuration Error: No active providers are configured to accept the appointment type ID ${appointmentTypeId}.`);
  }

  // 2. Collect unique NexHealth provider IDs from the results
  const providerIds = Array.from(
    new Set(activeProviders.map((sp) => sp.provider.nexhealthProviderId))
  );

  // 3. Collect unique NexHealth operatory IDs from all found providers
  const operatoryIds = Array.from(
    new Set(
      activeProviders
        .flatMap((sp) => sp.assignedOperatories)
        .map((assignment) => assignment.savedOperatory.nexhealthOperatoryId)
    )
  );

  if (operatoryIds.length === 0) {
    throw new Error(`Configuration Error: The active providers for appointment type ID ${appointmentTypeId} have no active operatories assigned.`);
  }

  // 4. Return the collected data
  return {
    duration: appointmentType.duration,
    providerIds,
    operatoryIds,
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
  data: {
    data: ProviderSlotData[];
    next_available_date?: string;
  };
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
  const { prisma } = await import("@/lib/prisma");
  
  // Get slot search parameters
  const { duration, providerIds, operatoryIds } = await getSlotSearchParams(
    appointmentTypeId,
    practice.id
  );

  console.log(`[Slot Search] Bulk searching for ${duration}-minute slots across ${searchDays} days with providers: ${providerIds.join(', ')} and operatories: ${operatoryIds.join(', ')}`);

  // Fetch practice-specific scheduling rules
  const practiceSettings = await prisma.practice.findUnique({
    where: { id: practice.id },
    select: {
      lunchBreakStart: true,
      lunchBreakEnd: true,
      minBookingBufferMinutes: true,
      timezone: true
    }
  });

  // Use practice timezone, default to America/Chicago if not set
  const timezone = practice.timezone || 'America/Chicago';
  const lunchBreakStart = practiceSettings?.lunchBreakStart;
  const lunchBreakEnd = practiceSettings?.lunchBreakEnd;
  const bookingBufferMinutes = practiceSettings?.minBookingBufferMinutes || 0;
  
  console.log(`[Slot Search] Searching from ${startDate} for ${searchDays} days in timezone ${timezone}`);

  try {
    // Build the query string for a single bulk API call
    let queryString = `start_date=${startDate}&days=${searchDays}&slot_length=${duration.toString()}`;
    queryString += `&lids[]=${practice.nexhealthLocationId}`;
    providerIds.forEach(id => {
      queryString += `&pids[]=${id}`;
    });
    operatoryIds.forEach(id => {
      queryString += `&operatory_ids[]=${id}`;
    });

    const pathWithQuery = `/appointment_slots?${queryString}`;

    console.log(`[NexHealth Bulk Request] Fetching ${searchDays} days with path: ${pathWithQuery}`);

    // Make single bulk API call to NexHealth
    const response = await fetchNexhealthAPI(
      pathWithQuery,
      practice.nexhealthSubdomain,
      undefined // Pass undefined for params since we built it into the path
    ) as NexHealthSlotsResponse;

    console.log(`[Slot Search] Bulk API response received for ${searchDays} days`);

    // Process the response data
    const responseData = response.data; // The object from fetchNexhealthAPI
    const nexhealthData = responseData.data; // The actual payload from NexHealth
    let nextAvailableDate: string | null = null;

    // Store next_available_date from the API response if present
    if (responseData && responseData.next_available_date) {
      nextAvailableDate = responseData.next_available_date;
      console.log(`[Slot Search] Found next_available_date: ${nextAvailableDate}`);
    }

    if (!nexhealthData || !Array.isArray(nexhealthData)) {
      console.log(`[Slot Search] No slot data received from bulk API call`);
      return { foundSlots: [], nextAvailableDate };
    }

    // Collect all slots from all providers across all days
    const allSlots = nexhealthData.flatMap((providerData: ProviderSlotData) => {
      if (providerData.slots && Array.isArray(providerData.slots)) {
        return providerData.slots.map((slot) => ({
          ...slot,
          providerId: providerData.pid,
          locationId: providerData.lid
        }));
      }
      return [];
    });

    console.log(`[Slot Search] Collected ${allSlots.length} total slots from bulk API response`);

    // Filter out slots that overlap with configurable lunch break
    const lunchFilteredSlots = allSlots.filter((slot) => {
      try {
        // Parse the slot time to get the start time
        const slotStartTime = DateTime.fromISO(slot.time).setZone(timezone);
        
        // Calculate the slot end time by adding duration
        const slotEndTime = slotStartTime.plus({ minutes: duration });
        
        // Check for lunch break conflicts only if lunch break is configured
        if (lunchBreakStart && lunchBreakEnd) {
          const [lunchStartHour, lunchStartMinute] = lunchBreakStart.split(':').map(Number);
          const [lunchEndHour, lunchEndMinute] = lunchBreakEnd.split(':').map(Number);
          
          const slotStartHour = slotStartTime.hour;
          const slotStartMinute = slotStartTime.minute;
          const slotEndHour = slotEndTime.hour;
          const slotEndMinute = slotEndTime.minute;
          
          // Check if slot overlaps with lunch break
          const slotStartsInLunch = (slotStartHour === lunchStartHour && slotStartMinute >= lunchStartMinute) || 
                                   (slotStartHour > lunchStartHour && slotStartHour < lunchEndHour) ||
                                   (slotStartHour === lunchEndHour && slotStartMinute < lunchEndMinute);
          
          const slotEndsInLunch = (slotEndHour === lunchStartHour && slotEndMinute > lunchStartMinute) || 
                                 (slotEndHour > lunchStartHour && slotEndHour < lunchEndHour) ||
                                 (slotEndHour === lunchEndHour && slotEndMinute <= lunchEndMinute);
          
          const slotSpansLunch = (slotStartHour < lunchStartHour || (slotStartHour === lunchStartHour && slotStartMinute <= lunchStartMinute)) && 
                               (slotEndHour > lunchEndHour || (slotEndHour === lunchEndHour && slotEndMinute >= lunchEndMinute));
          
          const isLunchConflict = slotStartsInLunch || slotEndsInLunch || slotSpansLunch;
          
          if (isLunchConflict) {
            console.log(`[Lunch Filter] Discarded slot at ${slot.time} - conflicts with lunch break (${lunchBreakStart} - ${lunchBreakEnd})`);
            return false;
          }
        }
        
        return true;
      } catch (error) {
        console.error(`[Lunch Filter] Error parsing slot time ${slot.time}:`, error);
        // Keep the slot if we can't parse it rather than losing potentially valid slots
        return true;
      }
    });

    console.log(`[Lunch Filter] Filtered ${allSlots.length} slots to ${lunchFilteredSlots.length} slots after removing lunch conflicts`);

    // Apply time bucket filter if specified
    let timeBucketFilteredSlots = lunchFilteredSlots;
    if (timeBucket && timeBucket !== 'AllDay' && TIME_BUCKETS[timeBucket]) {
      const timeBucketRange = TIME_BUCKETS[timeBucket];
      const [startHour, startMinute] = timeBucketRange.start.split(':').map(Number);
      const [endHour, endMinute] = timeBucketRange.end.split(':').map(Number);
      
      console.log(`[Time Bucket Filter] Filtering slots for ${timeBucket} preference (${timeBucketRange.start} - ${timeBucketRange.end})`);
      
      timeBucketFilteredSlots = lunchFilteredSlots.filter(slot => {
        const slotTime = DateTime.fromISO(slot.time, { zone: timezone });
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
      
      console.log(`[Time Bucket Filter] Filtered from ${lunchFilteredSlots.length} to ${timeBucketFilteredSlots.length} slots for ${timeBucket} preference`);
    }

    // Apply booking buffer filter - remove slots that are too soon from now
    const now = DateTime.now().setZone(timezone);
    const bookingBufferSlots = timeBucketFilteredSlots.filter(slot => {
      const slotStartTime = DateTime.fromISO(slot.time, { zone: timezone });
      const minutesFromNow = slotStartTime.diff(now, 'minutes').minutes;
      
      if (minutesFromNow < bookingBufferMinutes) {
        console.log(`[Booking Buffer] Discarded slot at ${slot.time} - too soon (${Math.round(minutesFromNow)} minutes from now, minimum required: ${bookingBufferMinutes})`);
        return false;
      }
      
      return true;
    });

    console.log(`[Booking Buffer] Filtered from ${timeBucketFilteredSlots.length} to ${bookingBufferSlots.length} slots after applying ${bookingBufferMinutes}-minute booking buffer`);

    // Sort slots chronologically to ensure earliest times are offered first
    bookingBufferSlots.sort((a, b) => a.time.localeCompare(b.time));
    console.log('[Slot Search] Sorted slots chronologically.');

    console.log(`[Slot Search] Bulk search complete: ${bookingBufferSlots.length} slots found across ${searchDays} days, next available: ${nextAvailableDate}`);

    return {
      foundSlots: bookingBufferSlots,
      nextAvailableDate
    };

  } catch (error) {
    console.error(`[Slot Search] Error in bulk API call:`, error);
    return { foundSlots: [], nextAvailableDate: null };
  }
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

 