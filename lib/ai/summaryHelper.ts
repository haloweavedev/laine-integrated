import type { ConversationState } from '@/types/laine';

/**
 * Generates a concise, professional appointment note for dental office staff
 * @param state The full conversation state containing booking details
 * @returns A professional note string for the appointment
 */
export async function generateAppointmentNote(
  state: ConversationState
): Promise<string> {
  const { appointmentTypeName, duration } = state.booking;

  const note = `
Appointment Type: ${appointmentTypeName || 'Not specified'}
Duration: ${duration || 'N/A'} minutes
  `.trim().replace(/^    /gm, ''); // Cleans up indentation

  console.log(`[SummaryHelper] Generated state-driven appointment note: "${note}"`);
  return Promise.resolve(note); // Return as a promise to maintain async signature
} 