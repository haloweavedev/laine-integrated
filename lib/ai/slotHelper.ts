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
 * @deprecated This function will be removed in a future refactor phase as we move to preference-based scheduling
 */
export async function normalizeDateWithAI(
  dateQuery: string, 
  practiceTimezone: string
): Promise<string | null> {
  try {
    // Get current date in practice timezone for context
    const now = DateTime.now().setZone(practiceTimezone);
    const currentDateForLLM = now.toFormat('yyyy-MM-dd');
    const currentDayOfWeekForLLM = now.toFormat('cccc'); // e.g., "Monday"
    const currentYear = now.year;
    
    console.log(`[Date Normalization] Parsing "${dateQuery}" in timezone ${practiceTimezone}, today is ${currentDateForLLM} (${currentDayOfWeekForLLM})`);

    const systemPromptContent = `You are a date parsing expert. Your task is to convert a user's spoken date query, which may include speech-to-text (STT) transcription artifacts, into a strict 'YYYY-MM-DD' format.

Current context:
- Today's date is: ${currentDateForLLM} (${currentDayOfWeekForLLM}).
- The user is interacting with a dental office in the timezone: ${practiceTimezone}.

General Date Interpretation Instructions:
1. Interpret relative dates like "today", "tomorrow", "next Monday", "in two weeks" based on the current date provided.
2. If a month and day are given (e.g., "December 23rd", "July 4th") without a year, assume the *next upcoming occurrence* of that date.
   - Example: If today is ${currentDateForLLM} and the user says "December 23rd", and December 23rd of the current year (${currentYear}) has already passed or is today, interpret it as December 23rd of the *next* year. Otherwise, interpret it as December 23rd of the current year.
3. If a full date with year is provided, use that.

Handling Speech-to-Text (STT) Artifacts for Dates:
STT systems sometimes misinterpret spoken ordinal numbers. You need to correct these common patterns:
- "twenty first" might be transcribed as "20 first". You should interpret this as the 21st.
- "twenty second" might be transcribed as "20 second". You should interpret this as the 22nd.
- "twenty third" might be transcribed as "20 third". You should interpret this as the 23rd.
- "twenty fourth" might be transcribed as "20 fourth". You should interpret this as the 24th.
- "twenty fifth" might be transcribed as "20 fifth". You should interpret this as the 25th.
- "twenty sixth" might be transcribed as "20 sixth". You should interpret this as the 26th.
- "twenty seventh" might be transcribed as "20 seventh". You should interpret this as the 27th.
- "twenty eighth" might be transcribed as "20 eighth". You should interpret this as the 28th.
- "twenty ninth" might be transcribed as "20 ninth". You should interpret this as the 29th.
- "thirty first" might be transcribed as "30 first". You should interpret this as the 31st.
- Similar patterns apply for other numbers (e.g., "thirty second" as "30 second" -> 32nd, but this would be invalid for dates).

STT Artifact Examples (Assume today is ${currentDateForLLM}):
- User Query: "December 20 third" -> This means December 23rd -> Calculate appropriate year based on current date
- User Query: "Jan 30 first" -> This means January 31st -> Calculate appropriate year based on current date
- User Query: "next month on the 20 second" -> This means the 22nd of next month -> Calculate appropriate YYYY-MM-DD
- User Query: "March 20 fifth" -> This means March 25th -> Calculate appropriate year based on current date

Additional STT Patterns to Handle:
- Numbers written as digits followed by words: "23 rd", "21 st", "22 nd" should be interpreted as 23rd, 21st, 22nd
- Mixed formats: "Dec 20 third", "January 30 first", etc.

Output Format (CRITICAL):
- If the query can be confidently resolved to a valid date after considering STT artifacts, your entire response MUST be ONLY the 'YYYY-MM-DD' string.
- If the query is ambiguous, nonsensical as a date, or clearly not a date after considering STT artifacts, respond with the exact string "INVALID_DATE".
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
 * Find the immediate next available slots for an appointment type
 * @param appointmentTypeId NexHealth appointment type ID
 * @param practice Practice details with NexHealth configuration
 * @returns Object with found slots and next available date if no slots found
 */
export async function findImmediateNextAvailableSlots(
  appointmentTypeId: string,
  practice: {
    id: string;
    nexhealthSubdomain: string;
    nexhealthLocationId: string;
    timezone: string;
  }
): Promise<{ foundSlots: SlotData[]; nextAvailableDate: string | null }> {
  const { fetchNexhealthAPI } = await import("@/lib/nexhealth");
  
  // Get slot search parameters
  const { duration, providerIds, operatoryIds } = await getSlotSearchParams(
    appointmentTypeId,
    practice.id
  );

  console.log(`[Immediate Slot Search] Searching for ${duration}-minute slots with providers: ${providerIds.join(', ')} and operatories: ${operatoryIds.join(', ')}`);

  // Use practice timezone, default to America/Chicago if not set
  const timezone = practice.timezone || 'America/Chicago';
  
  // Get current date and set up search dates (today, tomorrow, day after tomorrow)
  const now = DateTime.now().setZone(timezone);
  const searchDates = [
    now.toFormat('yyyy-MM-dd'),           // today
    now.plus({ days: 1 }).toFormat('yyyy-MM-dd'), // tomorrow  
    now.plus({ days: 2 }).toFormat('yyyy-MM-dd')  // day after tomorrow
  ];

  console.log(`[Immediate Slot Search] Searching dates: ${searchDates.join(', ')} in timezone ${timezone}`);

  const foundSlots: SlotData[] = [];
  let nextAvailableDate: string | null = null;

  // Search up to 3 days
  for (let i = 0; i < searchDates.length; i++) {
    const startDate = searchDates[i];
    
    try {
      console.log(`[Immediate Slot Search] Searching date ${startDate} (day ${i + 1}/3)`);
      
      // Construct API parameters for NexHealth appointment_slots endpoint
      const params: Record<string, string | string[]> = {
        start_date: startDate,
        days: '1',
        'lids[]': practice.nexhealthLocationId,
        slot_length: duration.toString()
      };

      // Add provider IDs as array parameters
      params['pids[]'] = providerIds;
      
      // Add operatory IDs as array parameters  
      params['operatory_ids[]'] = operatoryIds;

      // Call NexHealth API
      const response = await fetchNexhealthAPI(
        '/appointment_slots',
        practice.nexhealthSubdomain,
        params
      ) as NexHealthSlotsResponse;

      console.log(`[Immediate Slot Search] API response for ${startDate}:`, JSON.stringify(response, null, 2));

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

        foundSlots.push(...daySlots);
        console.log(`[Immediate Slot Search] Found ${daySlots.length} slots on ${startDate}, total so far: ${foundSlots.length}`);

        // If we have 2 or more slots, we can break early
        if (foundSlots.length >= 2) {
          console.log(`[Immediate Slot Search] Found sufficient slots (${foundSlots.length}), stopping search`);
          break;
        }
      }

      // Store next_available_date from the last API response if present
      if (response.next_available_date) {
        nextAvailableDate = response.next_available_date;
        console.log(`[Immediate Slot Search] Found next_available_date: ${nextAvailableDate}`);
      }

    } catch (error) {
      console.error(`[Immediate Slot Search] Error searching ${startDate}:`, error);
      // Continue to next date on error
    }
  }

  // Limit to first 2-3 slots for response
  const limitedSlots = foundSlots.slice(0, 3);
  
  console.log(`[Immediate Slot Search] Final result: ${limitedSlots.length} slots found, next available: ${nextAvailableDate}`);

  return {
    foundSlots: limitedSlots,
    nextAvailableDate
  };
}

/**
 * Generate a natural AI response for immediate slot checking results
 * @param searchResult The result from findImmediateNextAvailableSlots
 * @param spokenName The natural name of the appointment type for conversation
 * @param practiceTimezone The practice's timezone for proper time formatting
 * @returns Generated AI response message
 */
export async function generateImmediateSlotResponse(
  searchResult: { foundSlots: SlotData[]; nextAvailableDate: string | null },
  spokenName: string,
  practiceTimezone: string
): Promise<string> {
  const { generateText } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");

  if (searchResult.foundSlots.length > 0) {
    // Format the slot times into a human-readable format
    const formattedSlots = searchResult.foundSlots.slice(0, 2).map((slot) => {
      try {
        // Parse the ISO time string and convert to practice timezone
        const slotDateTime = DateTime.fromISO(slot.time).setZone(practiceTimezone);
        const isToday = slotDateTime.hasSame(DateTime.now().setZone(practiceTimezone), 'day');
        const isTomorrow = slotDateTime.hasSame(DateTime.now().setZone(practiceTimezone).plus({ days: 1 }), 'day');
        
        let dayReference: string;
        if (isToday) {
          dayReference = "today";
        } else if (isTomorrow) {
          dayReference = "tomorrow";
        } else {
          dayReference = slotDateTime.toFormat('EEEE'); // e.g., "Wednesday"
        }
        
        const timeString = slotDateTime.toFormat('h:mm a'); // e.g., "2:30 PM"
        return `${dayReference} at ${timeString}`;
      } catch (error) {
        console.error('[Immediate Slot Response] Error formatting slot time:', error);
        return slot.time; // Fallback to raw time
      }
    });

    const slotsList = formattedSlots.join(' or ');
    
    const systemPrompt = `You are Laine, a helpful dental assistant. For the patient's ${spokenName}, you have found the following openings: ${slotsList}. Offer these to the patient and ask if either would work. Be warm, friendly, and professional. Keep your response concise.`;

    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [
          { role: 'system', content: systemPrompt }
        ],
        temperature: 0.3,
        maxTokens: 100
      });

      return text.trim() || `Great! For your ${spokenName}, I have ${slotsList} available. Would either of those work for you?`;
    } catch (error) {
      console.error('[Immediate Slot Response] Error generating AI response:', error);
      return `Great! For your ${spokenName}, I have ${slotsList} available. Would either of those work for you?`;
    }

  } else if (searchResult.nextAvailableDate) {
    // Format the next available date into a friendly format
    let friendlyDate: string;
    try {
      const nextDate = DateTime.fromISO(searchResult.nextAvailableDate).setZone(practiceTimezone);
      friendlyDate = nextDate.toFormat('EEEE, MMMM d'); // e.g., "Wednesday, July 9th"
    } catch (error) {
      console.error('[Immediate Slot Response] Error formatting next available date:', error);
      friendlyDate = searchResult.nextAvailableDate;
    }

    const systemPrompt = `You are Laine, a helpful dental assistant. For the patient's ${spokenName}, there are no openings in the next few days. The next available date is ${friendlyDate}. Inform the patient and ask if they'd like you to check for times on that day. Be warm, empathetic, and helpful.`;

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
      console.error('[Immediate Slot Response] Error generating AI response for next available:', error);
      return `I'm sorry, we don't have any openings for your ${spokenName} in the next few days. The next available date is ${friendlyDate}. Would you like me to check for times on that day?`;
    }

  } else {
    // No slots found and no next available date
    const systemPrompt = `You are Laine, a helpful dental assistant. For the patient's ${spokenName}, it looks like we are fully booked for the near future. Apologize and suggest that a staff member will call them back to find a time. Be warm, empathetic, and professional.`;

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
      console.error('[Immediate Slot Response] Error generating AI response for no availability:', error);
      return `I'm sorry, it looks like we're fully booked for your ${spokenName} in the near future. Let me have one of our staff members call you back to find a time that works.`;
    }
  }
} 