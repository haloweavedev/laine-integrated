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
      description: "Finds the next 2 available appointment slots based on the user's preferred days and time of day. Use this AFTER an appointment type has been confirmed.",
      parameters: {
        type: "object" as const,
        properties: {
          preferredDaysOfWeek: {
            type: "string" as const,
            description: "A JSON string array of the user's preferred days of the week. Example: '[\"Monday\", \"Wednesday\"]'. This is collected from the user."
          },
          timeBucket: {
            type: "string" as const,
            description: "The user's general time preference, which must be one of the following values: 'Early', 'Morning', 'Midday', 'Afternoon', 'Evening', 'Late', or 'AllDay'. This is collected from the user."
          },
          conversationState: {
            type: "string" as const,
            description: "CRITICAL: The JSON string representing the current_conversation_state_snapshot from the result of the PREVIOUS tool call (e.g., from findAppointmentType). This contains essential context like the appointment type ID and duration."
          }
        },
        required: ["preferredDaysOfWeek", "timeBucket", "conversationState"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi/tool-calls`,
    }
  };
} 