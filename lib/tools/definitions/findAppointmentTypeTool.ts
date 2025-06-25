import type { VapiTool } from '@/types/vapi';

/**
 * Get the VAPI tool definition for findAppointmentType
 * This tool identifies the most suitable dental appointment type based on patient needs
 */
export function getFindAppointmentTypeTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "findAppointmentType",
      description: "Identifies the most suitable dental appointment type based on the patient's stated needs, symptoms, or request. Use this to understand what kind of appointment the patient is looking for before checking availability or booking.",
      parameters: {
        type: "object" as const,
        properties: {
          patientRequest: {
            type: "string" as const,
            description: "The patient's verbatim description of their reason for calling, their symptoms, or the type of appointment they are requesting. For example, 'I have a toothache', 'I need a cleaning', or 'My crown fell off and I need it re-cemented'."
          }
        },
        required: ["patientRequest"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi/tool-calls`,
    }
  };
} 