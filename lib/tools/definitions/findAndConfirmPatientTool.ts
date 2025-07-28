import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for findAndConfirmPatient
 * This tool looks up an existing patient by their full name and date of birth to confirm their record
 */
export function getFindAndConfirmPatientTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "findAndConfirmPatient",
      description: "Looks up an existing patient by their full name and date of birth to confirm their record. Use this after an existing patient provides both their name and DOB.",
      parameters: {
        type: "object" as const,
        properties: {
          fullName: { 
            type: "string" as const, 
            description: "The patient's full name (first and last name)." 
          },
          dateOfBirth: { 
            type: "string" as const, 
            description: "The patient's date of birth in YYYY-MM-DD format." 
          },
        },
        required: ["fullName", "dateOfBirth"],
      },
    },
    server: { 
      url: `${appBaseUrl}/api/vapi-webhook`,
      timeoutSeconds: 25
    }
  };
} 