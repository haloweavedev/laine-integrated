// lib/tools/findPatient.ts
import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";

// Helper to get current date context
function getCurrentDateContext(): string {
  const today = new Date();
  return `Today is ${today.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  })}`;
}

export const findPatientSchema = z.object({
  firstName: z.string()
    .min(1)
    .describe(`Extract patient's first name. If spelled letter by letter (B-O-B), convert to proper name (Bob).

Examples: "My name is Bob Ross" → "Bob", "First name B-O-B" → "Bob"`),
  lastName: z.string()
    .min(1)
    .describe(`Extract patient's last name. If spelled letter by letter (R-O-S-S), convert to proper name (Ross).

Examples: "Bob Ross" → "Ross", "last name R-O-S-S" → "Ross"`),
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .describe(`Convert date of birth to YYYY-MM-DD format.

${getCurrentDateContext()}

Examples: "October 30, 1998" → "1998-10-30", "10/30/98" → "1998-10-30"
For 2-digit years: 50-99 → 1900s, 00-49 → 2000s`)
});

const findPatientTool: ToolDefinition<typeof findPatientSchema> = {
  name: "find_patient_in_ehr",
  description: "Searches for an existing patient in the Electronic Health Record using first name, last name, and date of birth. Use this before any appointment scheduling to verify patient identity.",
  schema: findPatientSchema,
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice, vapiCallId } = context;
    
    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return {
        success: false,
        error_code: "PRACTICE_CONFIG_MISSING",
        message_to_patient: "I'm sorry, I can't access patient records right now. Please contact the office directly at your convenience."
      };
    }

    try {
      const patientName = `${args.firstName} ${args.lastName}`;
      const searchParams = {
        location_id: practice.nexhealthLocationId,
        name: patientName,
        date_of_birth: args.dateOfBirth,
        inactive: 'false',
        non_patient: 'false',
        page: '1',
        per_page: '5'
      };

      console.log(`[findPatient] Searching for: ${patientName}, DOB: ${args.dateOfBirth}`);
      
      const searchResults = await fetchNexhealthAPI(
        '/patients',
        practice.nexhealthSubdomain,
        searchParams
      );
      
      // Handle different response structures
      let patients = [];
      if (Array.isArray(searchResults)) {
        patients = searchResults;
      } else if (searchResults?.data?.patients) {
        patients = searchResults.data.patients;
      } else if (searchResults?.patients) {
        patients = searchResults.patients;
      } else if (searchResults?.data && Array.isArray(searchResults.data)) {
        patients = searchResults.data;
      }

      console.log(`[findPatient] Found ${patients.length} potential matches`);

      if (patients.length === 0) {
        // Format the date for friendly display
        const dobParts = args.dateOfBirth.split('-');
        const dobDate = new Date(parseInt(dobParts[0]), parseInt(dobParts[1]) - 1, parseInt(dobParts[2]));
        const friendlyDob = dobDate.toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        });
        
        return {
          success: true,
          message_to_patient: `I couldn't find a patient record for ${args.firstName} ${args.lastName} with date of birth ${friendlyDob}. Are you a new patient with us, or would you like to try different information?`,
          data: { 
            found_patients: [], 
            patient_exists: false,
            searched_name: `${args.firstName} ${args.lastName}`,
            searched_dob: args.dateOfBirth
          }
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patient = patients[0] as any; // Take first match
      
      // Store patient context for subsequent tool calls
      await updateCallLogWithPatient(vapiCallId, practice.id, String(patient.id));
      
      // Format the date of birth for natural speech
      const patientDob = patient.bio?.date_of_birth || patient.date_of_birth || args.dateOfBirth;
      const dobParts = patientDob.split('-');
      const dobDate = new Date(parseInt(dobParts[0]), parseInt(dobParts[1]) - 1, parseInt(dobParts[2]));
      const friendlyDob = dobDate.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
      
      return {
        success: true,
        message_to_patient: `Great! I found ${patient.first_name || args.firstName} ${patient.last_name || args.lastName}, born ${friendlyDob}. What type of appointment would you like to schedule today?`,
        data: {
          found_patients: [{
            id: patient.id,
            firstName: patient.first_name,
            lastName: patient.last_name,
            dob: patientDob
          }],
          patient_exists: true,
          patient_id: patient.id
        }
      };

    } catch (error) {
      console.error(`[findPatient] Error:`, error);
      
      let message = "I'm having trouble accessing patient records right now. Please try again in a moment or contact the office directly.";
      if (error instanceof Error && error.message.includes("401")) {
        message = "There's an authentication issue with the patient system. Please contact the office for assistance.";
      }
      
      return {
        success: false,
        error_code: "NEXHEALTH_API_ERROR",
        message_to_patient: message,
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me look that up for you...",
    success: "Perfect! I found your information.",
    fail: "I'm having trouble finding that record. Let me help you with that."
  }
};

async function updateCallLogWithPatient(vapiCallId: string, practiceId: string, patientId: string) {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.callLog.upsert({
      where: { vapiCallId },
      create: {
        vapiCallId,
        practiceId,
        callStatus: "TOOL_IN_PROGRESS",
        nexhealthPatientId: patientId,
        callTimestampStart: new Date()
      },
      update: {
        nexhealthPatientId: patientId,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error("[findPatient] Error updating call log:", error);
  }
}

export default findPatientTool; 