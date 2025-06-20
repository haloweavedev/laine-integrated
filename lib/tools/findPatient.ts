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
    .describe(`Patient's first name. If spelled out (B-O-B), convert to proper form (Bob). Example: "My name is Bob Ross" → "Bob"`),
  lastName: z.string()
    .min(1)
    .describe(`Patient's last name. If spelled out (R-O-S-S), convert to proper form (Ross). Example: "Bob Ross" → "Ross"`),
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .describe(`Date of birth in YYYY-MM-DD format. ${getCurrentDateContext()} Examples: "October 30, 1998" → "1998-10-30", "10/30/98" → "1998-10-30"`)
});

const findPatientTool: ToolDefinition<typeof findPatientSchema> = {
  name: "find_patient_in_ehr",
  description: `
    Verifies an existing patient's identity and retrieves their EHR record using their first name, last name, and date of birth.
    WHEN TO USE: Call this tool when a patient indicates they are an existing patient and provides their full name and complete date of birth.
    REQUIRED INPUTS: 'firstName', 'lastName', 'dateOfBirth' (in YYYY-MM-DD format).
    OUTPUTS: On success, returns 'patient_id', 'confirmed_patient_name', and 'confirmed_patient_dob_friendly'. Sets patient context for the call.
    IMPORTANT: Ensure you have collected all three pieces of information (first name, last name, full date of birth) before calling. If information is partial, ask the user for the missing parts first.
  `.trim(),
  schema: findPatientSchema,
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice, vapiCallId } = context;
    
    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return {
        success: false,
        error_code: "PRACTICE_CONFIG_MISSING",
        message_to_patient: "Practice configuration error",
        details: "Missing practice configuration"
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
        per_page: '300'
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
          message_to_patient: "", // Will be filled by dynamic generation
          data: { 
            found_patients: [], 
            patient_exists: false,
            searched_name: `${args.firstName} ${args.lastName}`,
            searched_dob: args.dateOfBirth,
            searched_dob_friendly: friendlyDob
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
        message_to_patient: "", // Will be filled by dynamic generation
        data: {
          found_patients: [{
            id: patient.id,
            firstName: patient.first_name,
            lastName: patient.last_name,
            dob: patientDob
          }],
          patient_exists: true,
          patient_id: patient.id,
          // Enhanced data for message generation:
          confirmed_patient_name: `${patient.first_name || args.firstName} ${patient.last_name || args.lastName}`,
          confirmed_patient_dob_friendly: friendlyDob
        }
      };

    } catch (error) {
      console.error(`[findPatient] Error:`, error);
      
      return {
        success: false,
        error_code: "NEXHEALTH_API_ERROR",
        message_to_patient: "", // Will be filled by dynamic generation
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
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