import { prisma } from "@/lib/prisma";
import { fetchNexhealthAPI, createPatient } from "@/lib/nexhealth";
import type { HandlerResult, ApiLog } from "@/types/vapi";
import type { ConversationState } from "@/types/laine";
import { mergeState } from '@/lib/utils/state-helpers';

interface IdentifyPatientArgs {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  email: string;
}

interface NexHealthPatient {
  id: number;
  first_name: string;
  last_name: string;
  bio?: {
    date_of_birth?: string;
  };
}

interface NexHealthApiData {
  patients: NexHealthPatient[];
}

interface NexHealthApiResponse {
  data?: NexHealthApiData;
}

interface NexHealthPatientResponse {
  data?: {
    user?: {
      id?: number;
    };
  };
  user?: {
    id?: number;
  };
}

/**
 * Handles the identifyPatient tool call
 * Intelligently searches for existing patients first, then creates new records if needed
 * This consolidates the logic from both findAndConfirmPatient and createPatientRecord
 */
export async function handleIdentifyPatient(
  currentState: ConversationState,
  args: IdentifyPatientArgs,
  toolCallId: string
): Promise<HandlerResult> {
  const apiLog: ApiLog = [];
  
  console.log(`[IdentifyPatientHandler] Processing identification for: "${args.firstName} ${args.lastName}", DOB: "${args.dateOfBirth}"`);

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
      console.error('[IdentifyPatientHandler] Practice missing NexHealth configuration');
      return {
        toolResponse: {
          toolCallId,
          error: "Practice NexHealth configuration incomplete."
        },
        newState: currentState
      };
    }

    console.log(`[IdentifyPatientHandler] Using practice: ${practice.nexhealthSubdomain}`);

    // Step 1: Search for existing patient by name
    const fullName = `${args.firstName} ${args.lastName}`;
    const { data: apiResponse, apiLog: searchApiLog } = await fetchNexhealthAPI(
      '/patients',
      practice.nexhealthSubdomain,
      { 
        location_id: practice.nexhealthLocationId,
        name: fullName
      },
      'GET',
      undefined,
      apiLog
    );

    const response = apiResponse as NexHealthApiResponse;
    const patients = response.data?.patients;

    console.log(`[IdentifyPatientHandler] API search returned ${patients?.length ?? 0} patient(s) with the name "${fullName}".`);

    // Step 2: If patients found, try to match by DOB
    if (Array.isArray(patients) && patients.length > 0) {
      console.log(`[IdentifyPatientHandler] Found ${patients.length} patient(s) with matching name, checking DOB`);

      // Debug logging before DOB comparison
      console.log(`[IdentifyPatientHandler] Searching for DOB: "${args.dateOfBirth}"`);
      patients.forEach((patient, index) => {
        console.log(`[IdentifyPatientHandler] Record ${index} DOB: "${patient.bio?.date_of_birth}"`);
      });

      // Find patient with matching date of birth
      const matchedPatient = patients.find(patient => {
        const recordDob = patient.bio?.date_of_birth;
        return typeof recordDob === 'string' && recordDob.trim() === args.dateOfBirth.trim();
      });

      if (matchedPatient) {
        // Step 3A: Existing patient found and confirmed
        console.log(`[IdentifyPatientHandler] Found existing patient with ID: ${matchedPatient.id}`);

        const newState = mergeState(currentState, {
          patient: {
            id: matchedPatient.id,
            status: 'IDENTIFIED_EXISTING',
            firstName: matchedPatient.first_name,
            lastName: matchedPatient.last_name,
            dob: args.dateOfBirth,
            phone: args.phoneNumber,
            email: args.email,
            isNameConfirmed: true
          }
        });

        return {
          toolResponse: {
            toolCallId,
            result: { 
              success: true, 
              nexhealthPatientId: matchedPatient.id,
              patientName: `${matchedPatient.first_name} ${matchedPatient.last_name}`,
              apiLog: searchApiLog
            },
            message: {
              type: "request-complete",
              role: "assistant",
              content: `Great, I've found and confirmed your record, ${args.firstName}. Now, let's get you scheduled.`
            }
          },
          newState
        };
      } else {
        console.log(`[IdentifyPatientHandler] Found patients with name but no DOB match - proceeding to create new record`);
      }
    }

    // Step 3B: No existing patient found, create new record
    console.log(`[IdentifyPatientHandler] No existing patient found. Creating new record.`);

    // Use hardcoded values for now (these should come from practice configuration)
    const { data: createResponse, apiLog: createApiLog } = await createPatient(
      {
        firstName: args.firstName,
        lastName: args.lastName,
        dateOfBirth: args.dateOfBirth,
        phoneNumber: args.phoneNumber,
        email: args.email
      },
      practice.nexhealthSubdomain,
      parseInt(practice.nexhealthLocationId),
      377851148, // hardcoded providerId - should be configurable
      searchApiLog
    );

    // Extract the patient ID from the response
    const nexHealthResponse = createResponse as NexHealthPatientResponse;
    const newPatientId = nexHealthResponse.data?.user?.id || nexHealthResponse.user?.id;

    if (!newPatientId) {
      console.error('[IdentifyPatientHandler] Patient ID missing from NexHealth create response:', createResponse);
      throw new Error("Patient ID missing from NexHealth response.");
    }

    console.log(`[IdentifyPatientHandler] Successfully created new patient with ID: ${newPatientId}`);

    const newState = mergeState(currentState, {
      patient: {
        id: newPatientId,
        status: 'NEW_DETAILS_COLLECTED',
        firstName: args.firstName,
        lastName: args.lastName,
        dob: args.dateOfBirth,
        phone: args.phoneNumber,
        email: args.email,
        isNameConfirmed: true
      }
    });

    return {
      toolResponse: {
        toolCallId,
        result: { 
          success: true, 
          nexhealthPatientId: newPatientId,
          apiLog: createApiLog
        },
        message: {
          type: "request-complete",
          role: "assistant",
          content: `Thank you! I've successfully created a record for you, ${args.firstName}. Now, let's find an appointment time.`
        }
      },
      newState
    };

  } catch (error) {
    console.error('[IdentifyPatientHandler] Error during patient identification:', error);
    return {
      toolResponse: {
        toolCallId,
        result: { success: false, apiLog },
        message: {
          type: "request-failed",
          role: "assistant", 
          content: "I'm sorry, I ran into a technical problem while processing your information. Let me have our staff call you back to help with your appointment."
        }
      },
      newState: currentState
    };
  }
}