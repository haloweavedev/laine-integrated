import type { VapiTool } from "@/types/vapi";

export function getConfirmBookingTool(appBaseUrl: string): VapiTool {
  return {
    type: "function",
    function: {
      name: "confirmBooking",
      description: "The final step to book the appointment. Use this tool ONLY after the user has verbally confirmed the appointment details (e.g., they said 'yes' or 'that's correct').",
      parameters: {
        type: "object" as const,
        properties: {
          finalConfirmation: {
            type: "boolean" as const,
            description: "Set to true to confirm that the user has verbally agreed to the booking details."
          }
        },
        required: ["finalConfirmation"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,
      timeoutSeconds: 15
    }
  };
} 