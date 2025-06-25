import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for checkAvailableSlots
 * This tool checks for available appointment slots for a previously identified appointment type
 */
export function getCheckAvailableSlotsTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "checkAvailableSlots",
      description: "Checks for available appointment slots for a previously identified appointment type on a specific date, optionally considering a time preference. Use this AFTER an appointment type has been confirmed with the user and they have provided a date.",
      parameters: {
        type: "object" as const,
        properties: {
          requestedDate: {
            type: "string" as const,
            description: "The date the patient wants to check for availability. Can be relative (e.g., 'tomorrow', 'next Monday') or specific (e.g., 'July 25th', 'August 10 2024')."
          },
          timePreference: {
            type: "string" as const,
            description: "Optional. The patient's preferred time of day (e.g., 'morning', 'afternoon', 'any time', 'around 2 PM')."
          },
          conversationState: {
            type: "string" as const,
            description: "CRITICAL: The JSON string representing the current_conversation_state_snapshot from the result of the PREVIOUS tool call (e.g., from findAppointmentType). This contains essential context like the appointment type ID and duration."
          }
        },
        required: ["requestedDate", "conversationState"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi/tool-calls`,
    }
  };
} 