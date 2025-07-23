import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for updateSelectedSlot
 * This tool captures and saves the user's chosen time slot from the presented options
 */
export function getUpdateSelectedSlotTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "updateSelectedSlot",
      description: "Use this tool to save the user's chosen appointment time slot after they have verbally selected it from the presented options.",
      parameters: {
        type: "object" as const,
        properties: {
          userSelection: {
            type: "string" as const,
            description: "The user's verbal selection of their preferred time slot. Examples: '8:30 is good', 'the first one', 'let's do the morning one', '10:10 AM works'."
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