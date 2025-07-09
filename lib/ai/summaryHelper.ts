import type { ConversationState } from '@/types/vapi';

/**
 * Generates a concise, professional appointment note for dental office staff
 * @param state The full conversation state containing booking details
 * @returns A professional note string for the appointment
 */
export async function generateAppointmentNote(
  state: ConversationState
): Promise<string> {
  const { typeName, duration, patientRequest } = state.appointmentBooking;

  const note = `
Appointment Type: ${typeName || 'Not specified'}
Duration: ${duration || 'N/A'} minutes
Patient's Stated Reason: "${patientRequest || 'Not available'}"
  `.trim().replace(/^    /gm, ''); // Cleans up indentation

  console.log(`[SummaryHelper] Generated state-driven appointment note: "${note}"`);
  return Promise.resolve(note); // Return as a promise to maintain async signature
} 