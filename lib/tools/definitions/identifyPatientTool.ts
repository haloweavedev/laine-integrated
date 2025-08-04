import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for identifyPatient
 * This intelligent tool handles both existing patient lookup and new patient creation
 */
export function getIdentifyPatientTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "identifyPatient",
      description: "Identifies an existing patient or creates a new patient record. Use this after collecting the patient's full name, date of birth, and other contact details.",
      parameters: {
        type: "object" as const,
        properties: {
          firstName: { 
            type: "string" as const, 
            description: "The patient's first name." 
          },
          lastName: { 
            type: "string" as const, 
            description: "The patient's last name." 
          },
          dateOfBirth: { 
            type: "string" as const, 
            description: "The patient's date of birth in YYYY-MM-DD format." 
          },
          phoneNumber: { 
            type: "string" as const, 
            description: "The patient's phone number (required for new patients)." 
          },
          email: { 
            type: "string" as const, 
            description: "The patient's email address (required for new patients)." 
          },
        },
        required: ["firstName", "lastName", "dateOfBirth", "phoneNumber", "email"],
      },
    },
    server: { 
      url: `${appBaseUrl}/api/vapi-webhook`,
      timeoutSeconds: 30
    }
  };
}