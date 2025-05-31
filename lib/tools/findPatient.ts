// lib/tools/findPatient.ts
import { z } from "zod";
import { ToolDefinition } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import { prisma } from "@/lib/prisma";

// Schema for the arguments the LLM will provide
export const schema = z.object({
  firstName: z.string().describe("The first name of the patient."),
  lastName: z.string().describe("The last name of the patient."),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD").describe("The patient's date of birth in YYYY-MM-DD format."),
});

const tool: ToolDefinition<typeof schema> = {
  name: "find_patient_in_ehr",
  description: "Searches for an existing patient in the Electronic Health Record (EHR) using their first name, last name, and date of birth. Confirms with the caller if a match is found.",
  schema,
  async run({ args, practice, vapiCallId }) {
    if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return { 
        success: false, 
        error_code: "PRACTICE_CONFIG_MISSING", 
        message_to_patient: "I'm sorry, I can't access patient records right now as the practice configuration is incomplete." 
      };
    }

    try {
      const patientName = `${args.firstName} ${args.lastName}`;
      // NexHealth GET /patients uses a single 'name' param and 'date_of_birth'
      const params = {
        location_id: practice.nexhealthLocationId,
        name: patientName,
        date_of_birth: args.dateOfBirth,
        inactive: 'false', // Only search active patients
        non_patient: 'false', // Exclude non-patients if applicable
        page: '1',
        per_page: '5' // Limit results
      };

      console.log(`[Tool:find_patient_in_ehr] Searching for patient: ${patientName}, DOB: ${args.dateOfBirth}`);
      
      const searchResults = await fetchNexhealthAPI(
        '/patients',
        practice.nexhealthSubdomain,
        params
      );
      
      // Handle different possible response structures from NexHealth
      let patients = [];
      if (Array.isArray(searchResults)) {
        patients = searchResults;
      } else if (searchResults?.data?.patients && Array.isArray(searchResults.data.patients)) {
        patients = searchResults.data.patients;
      } else if (searchResults?.patients && Array.isArray(searchResults.patients)) {
        patients = searchResults.patients;
      } else if (searchResults?.data && Array.isArray(searchResults.data)) {
        patients = searchResults.data;
      } else {
        console.warn("[Tool:find_patient_in_ehr] Unexpected response structure:", searchResults);
      }

      console.log(`[Tool:find_patient_in_ehr] Found ${patients.length} potential matches`);

      if (patients.length === 0) {
        return { 
          success: true, 
          found_patients: [], 
          message_to_patient: `I couldn't find anyone named ${args.firstName} ${args.lastName} with that date of birth. Would you like to try spelling the name differently or provide different details?` 
        };
      } else if (patients.length === 1) {
        const patient = patients[0];
        
        // Store patient ID in CallLog for context if we have a call ID
        if (vapiCallId) {
          try {
            await prisma.callLog.upsert({
              where: { vapiCallId },
              create: { 
                vapiCallId, 
                practiceId: practice.id, 
                callStatus: "TOOL_IN_PROGRESS",
                nexhealthPatientId: String(patient.id),
                callTimestampStart: new Date() 
              },
              update: { 
                nexhealthPatientId: String(patient.id),
                updatedAt: new Date() 
              },
            });
          } catch (dbError) {
            console.error(`[Tool:find_patient_in_ehr] Error updating CallLog:`, dbError);
          }
        }
        
        return { 
          success: true, 
          found_patients: [{ 
            id: patient.id, 
            firstName: patient.first_name, 
            lastName: patient.last_name, 
            dob: patient.bio?.date_of_birth || patient.date_of_birth 
          }],
          message_to_patient: `Great! I found ${patient.first_name || args.firstName} ${patient.last_name || args.lastName}. Is that the correct patient?` 
        };
      } else {
        // Handle multiple matches - take the first one and confirm, or list options
        const firstPatient = patients[0];
        const patientList = patients.slice(0, 3).map((p: { 
          id: number; 
          first_name?: string; 
          last_name?: string; 
          bio?: { date_of_birth?: string }; 
          date_of_birth?: string; 
        }) => ({ 
          id: p.id, 
          firstName: p.first_name, 
          lastName: p.last_name, 
          dob: p.bio?.date_of_birth || p.date_of_birth 
        }));
        
        return { 
          success: true, 
          found_patients: patientList,
          message_to_patient: `I found a few people with that name. Are you ${firstPatient.first_name || args.firstName} ${firstPatient.last_name || args.lastName} born on ${firstPatient.bio?.date_of_birth || firstPatient.date_of_birth || args.dateOfBirth}?`
        };
      }
    } catch (error: unknown) {
      console.error(`[Tool:find_patient_in_ehr] Error for practice ${practice.id}:`, error);
      let userMessage = "I encountered an issue trying to find the patient record. Please try again in a moment.";
      if (error instanceof Error && error.message?.includes("401")) {
        userMessage = "There was an authentication issue with the patient system. Please contact support.";
      } else if (error instanceof Error && error.message?.includes("403")) {
        userMessage = "I don't have permission to access patient records. Please contact support.";
      }
      return { 
        success: false, 
        error_code: "NEXHEALTH_API_ERROR", 
        message_to_patient: userMessage,
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
  // VAPI specific messages for tool call lifecycle
  messages: {
    start: "Let me look up that patient record for you...",
    success: "Found the patient information.",
    fail: "I'm having trouble accessing patient records at the moment.",
  },
};

export default tool; 