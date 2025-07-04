import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { DateTime } from "luxon";
import type { ConversationState } from "@/types/vapi";

/**
 * Generate a natural language confirmation message for appointment booking
 * @param state ConversationState containing appointment details
 * @returns Promise<string> - The generated confirmation message
 */
export async function generateConfirmationMessage(
  state: ConversationState
): Promise<string> {
  try {
    // Validate required state
    if (!state.appointmentBooking.selectedSlot) {
      throw new Error("No selected slot found in conversation state");
    }

    // Format the selected time into a friendly format
    const selectedTime = DateTime.fromISO(state.appointmentBooking.selectedSlot.time);
    const dayName = selectedTime.toFormat('cccc'); // Full day name (e.g., "Friday")
    const time = selectedTime.toFormat('h:mm a'); // Time format (e.g., "2:00 PM")
    const date = selectedTime.toFormat('MMMM d'); // Date format (e.g., "December 23")

    // Get the spoken name of the appointment type
    const appointmentType = state.appointmentBooking.spokenName || 
                           state.appointmentBooking.typeName || 
                           'appointment';

    // Create the prompt for the AI
    const prompt = `You are an AI response generator creating a final confirmation sentence for a voice assistant named Laine.

**CRITICAL RULES:**
1. **ONE UNBROKEN SENTENCE.**
2. **SUMMARIZE KEY DETAILS:** Include the appointment's spoken name and the selected time.
3. **END WITH A QUESTION:** The sentence must end with a clear confirmation question like "Is that all correct?" or "Does that sound right?".

**Context:**
- Appointment Type: ${appointmentType}
- Selected Time: ${dayName}, ${date} at ${time}

**Example Output:** "Okay, great. So I have you down for a ${appointmentType} on ${dayName}, ${date} at ${time}. Is that all correct?"

Your turn. Generate the single, fluid, spoken response for Laine:`;

    // Generate the confirmation message using OpenAI
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: prompt,
      temperature: 0.7,
      maxTokens: 100,
    });

    return result.text.trim();

  } catch (error) {
    console.error("[ConfirmationHelper] Error generating confirmation message:", error);
    
    // Fallback to a simple template-based message if AI generation fails
    const selectedTime = DateTime.fromISO(state.appointmentBooking.selectedSlot?.time || "");
    const dayName = selectedTime.toFormat('cccc');
    const time = selectedTime.toFormat('h:mm a');
    const date = selectedTime.toFormat('MMMM d');
    const appointmentType = state.appointmentBooking.spokenName || 
                           state.appointmentBooking.typeName || 
                           'appointment';

    return `Great. So I have you down for a ${appointmentType} on ${dayName}, ${date} at ${time}. Is that all correct?`;
  }
} 