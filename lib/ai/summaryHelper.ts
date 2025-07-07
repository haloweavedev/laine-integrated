import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { CoreMessage } from "ai";
import type { ConversationState } from '@/types/vapi';

/**
 * Generates a concise, professional appointment note for dental office staff
 * @param state The full conversation state containing booking details
 * @param transcript The call transcript for context-rich note generation
 * @returns A professional note string for the appointment
 */
export async function generateAppointmentNote(
  state: ConversationState,
  transcript: string
): Promise<string> {
  try {
    const { appointmentBooking } = state;
    
    const prompt = `You are an expert at summarizing conversations for a dental office's internal notes. Based on the provided call transcript, create a concise, one-to-two-sentence note for the appointment.

**CRITICAL RULES:**
1.  Be brief and professional.
2.  Focus on the patient's stated problem or reason for the visit.
3.  Do not include conversational filler (e.g., "Patient said hello").

**Call Transcript:**
---
${transcript || "No transcript available."}
---

**Example Output:** "Patient called regarding a chipped front tooth. Mentioned it is not causing pain but would like it looked at soon."

Your turn. Generate the appointment note:`;

    const messages: CoreMessage[] = [
      { role: 'user', content: prompt }
    ];

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.3,
      maxTokens: 100
    });

    const generatedNote = text.trim();
    
    if (!generatedNote) {
      console.warn('[SummaryHelper] No note generated, using fallback');
      const appointmentType = appointmentBooking.spokenName || appointmentBooking.typeName || 'appointment';
      const patientRequest = appointmentBooking.patientRequest || 'General request';
      return `${appointmentType} appointment. Original request: ${patientRequest}`;
    }

    console.log(`[SummaryHelper] Generated appointment note: "${generatedNote}"`);
    return generatedNote;

  } catch (error) {
    console.error('[SummaryHelper] Error generating appointment note:', error);
    
    // Fallback to a simple note if AI fails
    const appointmentType = state.appointmentBooking.spokenName || 
                           state.appointmentBooking.typeName || 
                           'appointment';
    const patientRequest = state.appointmentBooking.patientRequest || 'General request';
    
    return `${appointmentType} appointment. Original request: ${patientRequest}`;
  }
} 