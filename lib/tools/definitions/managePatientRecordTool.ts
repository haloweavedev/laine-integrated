import type { VapiTool } from "@/types/vapi";

export function getManagePatientRecordTool(appBaseUrl: string): VapiTool {
  return {
    type: "function",
    function: {
      name: "managePatientRecord",
      description: "Handles everything related to identifying an existing patient or creating a new patient record. Call this tool after the appointment type is known. Pass any information the user provides.",
      parameters: {
        type: "object" as const,
        properties: {
          fullName: { type: "string", description: "The patient's full name." },
          dob: { type: "string", description: "The patient's date of birth." },
          phone: { type: "string", description: "The patient's phone number." },
          email: { type: "string", description: "The patient's email address." },
          userConfirmation: { type: "string", description: "The user's confirmation response (e.g., 'yes', 'no')." }
        },
        required: []
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi/tool-calls`,
    }
  };
} 