// lib/tools/findPatient.ts
import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";

export const findPatientSchema = z.object({
  firstName: z.string().min(1).describe("The first name of the patient"),
  lastName: z.string().min(1).describe("The last name of the patient"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").describe("Patient's date of birth in YYYY-MM-DD format")
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
        message_to_patient: "I'm sorry, I can't access patient records right now. Please contact the office directly."
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
        return {
          success: true,
          message_to_patient: `I couldn't find a patient named ${args.firstName} ${args.lastName} with that date of birth. Would you like me to help you schedule as a new patient, or would you like to try different information?`,
          data: { found_patients: [], patient_exists: false }
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patient = patients[0] as any; // Take first match
      
      // Store patient context for subsequent tool calls
      await updateCallLogWithPatient(vapiCallId, practice.id, String(patient.id));
      
      return {
        success: true,
        message_to_patient: `Great! I found ${patient.first_name || args.firstName} ${patient.last_name || args.lastName}, born ${patient.bio?.date_of_birth || args.dateOfBirth}. Is this the correct patient?`,
        data: {
          found_patients: [{
            id: patient.id,
            firstName: patient.first_name,
            lastName: patient.last_name,
            dob: patient.bio?.date_of_birth || patient.date_of_birth
          }],
          patient_exists: true,
          patient_id: patient.id
        }
      };

    } catch (error) {
      console.error(`[findPatient] Error:`, error);
      
      let message = "I'm having trouble accessing patient records right now. Please try again in a moment.";
      if (error instanceof Error && error.message.includes("401")) {
        message = "There's an authentication issue with the patient system. Please contact support.";
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