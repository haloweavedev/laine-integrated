import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for identifyOrCreatePatient
 * This tool identifies an existing patient or creates a new one through a conversational flow
 */
export function getIdentifyOrCreatePatientTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "identifyOrCreatePatient",
      description: "Identifies an existing patient or creates a new one. Call this after the appointment type is known but before checking for availability. Use its `result` to ask the user for information like their name, date of birth, phone, and email one piece at a time.",
      parameters: {
        type: "object" as const,
        properties: {
          fullName: {
            type: "string" as const,
            description: "The patient's full name (first and last name together). For example, 'John Smith' or 'Mary Johnson'."
          },
          dob: {
            type: "string" as const,
            description: "The patient's date of birth in any common format. For example, '01/15/1990', 'January 15, 1990', or '15 January 1990'."
          },
          phone: {
            type: "string" as const,
            description: "The patient's phone number. For example, '555-123-4567' or '(555) 123-4567'."
          },
          email: {
            type: "string" as const,
            description: "The patient's email address. For example, 'john.smith@email.com'."
          },
          userConfirmation: {
            type: "string" as const,
            description: "The user's confirmation response when asked to confirm information. Use this for responses like 'yes', 'correct', 'no', 'that's right', 'wrong', etc."
          }
        },
        required: []
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi/tool-calls`,
    }
  };
} 