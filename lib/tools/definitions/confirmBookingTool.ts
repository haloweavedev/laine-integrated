import type { VapiTool } from "@/types/vapi";

export function getConfirmBookingTool(appBaseUrl: string): VapiTool {
  return {
    type: "function",
    function: {
      name: "confirmBooking",
      description: "Finalizes a previously held appointment slot by converting it to a confirmed booking. Use this tool ONLY after the user has verbally confirmed the appointment details (e.g., they said 'yes' or 'that's correct'). This completes the Hold & Confirm booking process.",
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