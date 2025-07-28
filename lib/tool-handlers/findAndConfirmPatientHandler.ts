import { prisma } from "@/lib/prisma";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import type { ConversationState, HandlerResult, ApiLog } from "@/types/vapi";
import { mergeState } from '@/lib/utils/state-helpers';

interface FindAndConfirmPatientArgs {
  fullName: string;
  dateOfBirth: string;
}

interface NexHealthPatient {
  id: number;
  first_name: string;
  last_name: string;
  bio?: { // Make bio optional for safety
    date_of_birth?: string; // Make dob optional for safety
  };
}

interface NexHealthApiData {
  patients: NexHealthPatient[];
}

interface NexHealthApiResponse {
  data?: NexHealthApiData; // The nested data object
}

/**
 * Handles the findAndConfirmPatient tool call
 * Looks up an existing patient by full name and validates their date of birth
 * @param currentState Current conversation state
 * @param args Tool arguments containing fullName and dateOfBirth
 * @param toolCallId ID of the tool call for response tracking
 * @returns HandlerResult with updated state if patient found, or appropriate error message
 */
export async function handleFindAndConfirmPatient(
  currentState: ConversationState,
  args: FindAndConfirmPatientArgs,
  toolCallId: string
): Promise<HandlerResult> {
  // Initialize API log array to capture all external calls
  const apiLog: ApiLog = [];

  console.log(`[FindAndConfirmPatient] Processing lookup for: "${args.fullName}", DOB: "${args.dateOfBirth}"`);

  try {
    if (!currentState.practiceId) {
      return {
        toolResponse: {
          toolCallId,
          error: "Practice configuration not found."
        },
        newState: currentState
      };
    }

    // Get practice details from database
    const practice = await prisma.practice.findUnique({
      where: { id: currentState.practiceId },
      select: {
        nexhealthSubdomain: true,
        nexhealthLocationId: true
      }
    });

    if (!practice?.nexhealthSubdomain || !practice?.nexhealthLocationId) {
      console.error('[FindAndConfirmPatient] Practice missing NexHealth configuration');
      return {
        toolResponse: {
          toolCallId,
          error: "Practice NexHealth configuration incomplete."
        },
        newState: currentState
      };
    }

    console.log(`[FindAndConfirmPatient] Using practice: ${practice.nexhealthSubdomain}`);

    // Call NexHealth API to search for patients by name
    const { data: apiResponse, apiLog: updatedApiLog } = await fetchNexhealthAPI(
      '/patients',
      practice.nexhealthSubdomain,
      { 
        location_id: practice.nexhealthLocationId,
        name: args.fullName
      },
      'GET',
      undefined,
      apiLog
    );

    const response = apiResponse as NexHealthApiResponse;
    const patients = response.data?.patients; // Safely access the nested array

    console.log(`[FindAndConfirmPatient] API search returned ${patients?.length ?? 0} patient(s) with the name "${args.fullName}".`);

    if (!Array.isArray(patients) || patients.length === 0) {
      console.log('[FindAndConfirmPatient] No patients array found in response.data or array is empty.');
      return {
        toolResponse: {
          toolCallId,
          result: { success: false, apiLog: updatedApiLog },
          message: {
            type: "request-complete",
            role: "assistant",
            content: "I couldn't find any record for that name and date of birth. Let's proceed with creating a new patient file for you. What's the best phone number and email address for you?"
          }
        },
        newState: currentState
      };
    }

    console.log(`[FindAndConfirmPatient] Found ${patients.length} patient(s) with matching name`);

    // Debug logging before DOB comparison
    console.log(`[Patient Search] Searching for DOB: "${args.dateOfBirth}" (Type: ${typeof args.dateOfBirth})`);
    patients.forEach((patient, index) => {
      console.log(`[Patient Search] Record ${index} DOB: "${patient.bio?.date_of_birth}" (Type: ${typeof patient.bio?.date_of_birth})`);
    });

    // Find patient with matching date of birth - defensive comparison
    const matchedPatient = patients.find(patient => {
      const recordDob = patient.bio?.date_of_birth;
      return typeof recordDob === 'string' && recordDob.trim() === args.dateOfBirth.trim();
    });

    if (matchedPatient) {
      console.log(`[Patient Search] SUCCESS: Found matching patient with ID ${matchedPatient.id}.`);
    } else {
      console.log(`[Patient Search] FAILED: No patient found with a matching DOB.`);
    }

    if (matchedPatient) {
      console.log(`[FindAndConfirmPatient] Successfully matched patient ID: ${matchedPatient.id}`);

      // Update conversation state with patient details
      const newState = mergeState(currentState, {
        patientDetails: {
          nexhealthPatientId: matchedPatient.id,
          collectedInfo: {
            firstName: matchedPatient.first_name,
            lastName: matchedPatient.last_name,
            dob: args.dateOfBirth
          }
        }
      });

      return {
        toolResponse: {
          toolCallId,
          result: { 
            success: true, 
            nexhealthPatientId: matchedPatient.id,
            patientName: `${matchedPatient.first_name} ${matchedPatient.last_name}`,
            apiLog: updatedApiLog 
          },
          message: {
            type: "request-complete",
            role: "assistant",
            content: `Great, I've found and confirmed your record, ${matchedPatient.first_name}. Now, let's find a time for your appointment. What day are you thinking?`
          }
        },
        newState
      };
    } else {
      console.log(`[FindAndConfirmPatient] Found patients with name but no DOB match`);
      return {
        toolResponse: {
          toolCallId,
          result: { success: false, apiLog: updatedApiLog },
          message: {
            type: "request-complete",
            role: "assistant",
            content: "I found a record for that name, but the date of birth doesn't match. To be safe, let's create a new file for you. I'll just need your phone number and email address to finish up."
          }
        },
        newState: currentState
      };
    }

  } catch (error) {
    console.error('[FindAndConfirmPatient] Error during patient lookup:', error);
    return {
      toolResponse: {
        toolCallId,
        result: { success: false, apiLog: apiLog },
        message: {
          type: "request-failed",
          role: "assistant", 
          content: "I'm sorry, I ran into a technical problem while looking up your record. Let me help you create a new patient file instead. What's your phone number and email address?"
        }
      },
      newState: currentState
    };
  }
} 