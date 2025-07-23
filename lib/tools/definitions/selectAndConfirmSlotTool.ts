import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for selectAndConfirmSlot
 * This tool captures the user's slot selection, saves it, and asks them for final confirmation
 */
export function getSelectAndConfirmSlotTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "selectAndConfirmSlot",
      description: "Captures the user's verbal choice of a time slot, saves it, and asks them for final confirmation. Use this immediately after presenting time options and the user indicates their choice.",
      parameters: {
        type: "object" as const,
        properties: {
          userSelection: {
            type: "string" as const,
            description: "The user's verbal selection of a time slot (e.g., '10 AM', 'the first one', '8:30')"
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