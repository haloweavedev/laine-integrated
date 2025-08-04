import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for holdAppointmentSlot
 * This tool is internal - not directly callable by the LLM, but invoked by other handlers
 * It places a temporary hold on an appointment slot to prevent race conditions
 */
export function getHoldAppointmentSlotTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "holdAppointmentSlot",
      description: "Internal tool: Places a temporary hold on an appointment slot to reserve it while confirming patient details. This prevents booking conflicts.",
      parameters: {
        type: "object" as const,
        properties: {
          slotId: {
            type: "string" as const,
            description: "The ID of the appointment slot to hold"
          }
        },
        required: ["slotId"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,
    }
  };
}