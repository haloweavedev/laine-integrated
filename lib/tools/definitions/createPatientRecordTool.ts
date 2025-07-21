import type { VapiTool } from '@/types/vapi';

export const createPatientRecordTool: VapiTool = {
  type: "function",
  function: {
    name: "create_patient_record",
    description: "Creates a new patient record in the dental practice's Electronic Health Record (EHR) system. Use this tool only after collecting the patient's full name, date of birth, phone number, and email address.",
    parameters: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "The patient's first name." },
        lastName: { type: "string", description: "The patient's last name." },
        dateOfBirth: { type: "string", description: "The patient's date of birth in YYYY-MM-DD format." },
        phoneNumber: { type: "string", description: "The patient's 10-digit phone number, without country code or symbols." },
        email: { type: "string", description: "The patient's email address." },
      },
      required: ["firstName", "lastName", "dateOfBirth", "phoneNumber", "email"],
    },
  },
  server: { url: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi-webhook` : '', timeoutSeconds: 25, async: false },
}; 