import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { DateTime } from "luxon";
import type { CoreMessage } from "ai";

/**
 * Normalize a date query using AI to convert natural language dates into YYYY-MM-DD format
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