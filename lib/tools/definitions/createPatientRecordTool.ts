import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for create_patient_record
 * This tool creates a new patient record in the dental practice's EHR system
 */
export function getCreatePatientRecordTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "create_patient_record",
      description: "Creates a new patient record in the dental practice's Electronic Health Record (EHR) system. Use this tool only after collecting the patient's full name, date of birth, phone number, and email address.",
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
            description: "The patient's 10-digit phone number, without country code or symbols." 
          },
          email: { 
            type: "string" as const, 
            description: "The patient's email address." 
          },
        },
        required: ["firstName", "lastName", "dateOfBirth", "phoneNumber", "email"],
      },
    },
    server: { 
      url: `${appBaseUrl}/api/vapi-webhook`,
      timeoutSeconds: 25
    }
  };
} 