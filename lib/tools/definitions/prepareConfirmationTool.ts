import type { VapiTool } from '@/types/vapi';

export function getPrepareConfirmationTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "prepareConfirmation",
      description: "Prepares the final confirmation message for the user after a time slot has been selected. This is the step right before final booking.",
      parameters: {
        type: "object" as const,
        properties: {},
        required: []
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,
    }
  };
} 