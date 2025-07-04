import type { VapiTool } from "@/types/vapi";

export function getBookAppointmentTool(appBaseUrl: string): VapiTool {
  return {
    type: "function",
    function: {
      name: "bookAppointment",
      description: "Finalizes and books the appointment after the user verbally agrees to one of the offered time slots. Use this as the final step.",
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