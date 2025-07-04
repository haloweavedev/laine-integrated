import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { CoreMessage } from "ai";
import type { ConversationState } from '@/types/vapi';

/**
 * Generates a concise, professional appointment note for dental office staff
 * @param state The full conversation state containing booking details
 * @returns A professional note string for the appointment
 */
export async function generateAppointmentNote(state: ConversationState): Promise<string> {
  try {
    const { appointmentBooking } = state;
    
    // Gather available context
    const patientRequest = appointmentBooking.patientRequest || 'General appointment request';
    const appointmentType = appointmentBooking.spokenName || appointmentBooking.typeName || 'Unknown type';
    const timePreference = appointmentBooking.lastTimePreference || null;
    
    // Build context for the AI
    let contextInfo = `Patient request: "${patientRequest}"`;
    contextInfo += `\nAppointment type: ${appointmentType}`;
    
    if (timePreference && timePreference !== 'Any') {
      contextInfo += `\nTime preference: ${timePreference}`;
    }
    
    const prompt = `You are generating a brief, professional note for a dental office appointment booking system.

Context from the call:
${contextInfo}

Create a concise internal note (1-2 sentences) that includes:
- The patient's original concern/request
- The type of appointment booked
- Any relevant preferences mentioned

The note should be professional and helpful for the dental office staff. Do not include patient names, specific times, or provider details.

Example: "Patient called regarding a missing tooth. Booked for a Dental Implant Consult. Indicated a preference for afternoon appointments."

Note:`;

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