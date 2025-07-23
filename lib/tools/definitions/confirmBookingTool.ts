import type { VapiTool } from "@/types/vapi";

export function getConfirmBookingTool(appBaseUrl: string): VapiTool {
  return {
    type: "function",
    function: {
      name: "confirmBooking",
      description: "Confirms and books the appointment using the patient details and the time slot already saved in the conversation. Call this only after a specific time has been selected and confirmed by the user. This is the final step.",
      parameters: {
        type: "object" as const,
        properties: {},
        required: []
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,
      timeoutSeconds: 10
    }
  };
} 