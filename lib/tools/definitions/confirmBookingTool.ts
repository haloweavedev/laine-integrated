import type { VapiTool } from "@/types/vapi";

export function getConfirmBookingTool(appBaseUrl: string): VapiTool {
  return {
    type: "function",
    function: {
      name: "confirmBooking",
      description: "Books the appointment. Call this **only** after the user has verbally agreed to a *specific time slot* (e.g., 'Yes, 9 AM works'). This is the final action to secure the appointment.",
      parameters: {
        type: "object" as const,
        properties: {
          userSelection: {
            type: "string" as const,
            description: "The user's verbatim selection of the time slot they want. For example, 'the 2 PM one', 'tomorrow at 7:40 AM', or 'yes, that first one works'."
          }
        },
        required: ["userSelection"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi/tool-calls`,
      timeoutSeconds: 10
    }
  };
} 