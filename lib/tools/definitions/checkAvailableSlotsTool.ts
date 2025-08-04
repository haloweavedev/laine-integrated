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
      description: "Finds available appointment times. By default, proactively searches for the next available appointments. Call this after the appointment type is known. Only include parameters if the user has specifically expressed preferences.",
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
          requestedDate: {
            type: "string" as const,
            description: "The user's specific requested date, like 'tomorrow', 'next Wednesday', or 'July 10th'. Use this for specific date searches."
          }
        },
        required: []
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,
    }
  };
} 