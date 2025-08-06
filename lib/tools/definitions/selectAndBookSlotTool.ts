import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for selectAndBookSlot
 * This tool selects a time slot and, with final user confirmation, books the appointment. This is the final step in the booking process.
 */
export function getSelectAndBookSlotTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "selectAndBookSlot",
      description: "Selects a time slot and, with final user confirmation, books the appointment. This is the final step in the booking process. Call once with user's selection, then again with finalConfirmation=true after they confirm.",
      parameters: {
        type: "object" as const,
        properties: {
          userSelection: {
            type: "string" as const,
            description: "The user's verbal selection of a time slot (e.g., '10 AM', 'the first one', '8:30')"
          },
          finalConfirmation: {
            type: "boolean" as const,
            description: "Set to true only after the user has verbally confirmed the exact time and date."
          }
        },
        required: ["userSelection"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,
    }
  };
} 