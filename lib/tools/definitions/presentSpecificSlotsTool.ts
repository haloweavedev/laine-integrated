import type { VapiTool } from "@/types/vapi";

export function getPresentSpecificSlotsTool(appBaseUrl: string): VapiTool {
  return {
    type: "function",
    function: {
      name: "presentSpecificSlots",
      description: "Takes a time bucket chosen by the user (e.g., 'Morning') and returns 2-3 specific, bookable time slots from within that bucket. **Do not call this for urgent appointments.**",
      parameters: {
        type: "object" as const,
        properties: {
          timeBucket: {
            type: "string" as const,
            description: "The time bucket the user selected, e.g., 'Morning'."
          }
        },
        required: ["timeBucket"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi/tool-calls`,
      timeoutSeconds: 10
    }
  };
} 