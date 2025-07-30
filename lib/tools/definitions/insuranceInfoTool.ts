import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for insuranceInfo
 * This tool answers patient questions about dental insurance acceptance
 */
export function getInsuranceInfoTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "insuranceInfo",
      description: "Answers patient questions about dental insurance acceptance. Use for general questions like 'What insurance do you take?' or specific questions like 'Do you accept Cigna?'",
      parameters: {
        type: "object" as const,
        properties: {
          insuranceName: {
            type: "string" as const,
            description: "The specific name of the insurance plan the user is asking about. Omit this for general questions."
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