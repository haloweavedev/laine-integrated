import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for handleSlotSelection
 * This tool captures the user's slot selection and updates the conversation state
 */
export function getHandleSlotSelectionTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "handleSlotSelection",
      description: "Use this tool after the user has verbally chosen a time slot from the options presented. This saves their choice.",
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