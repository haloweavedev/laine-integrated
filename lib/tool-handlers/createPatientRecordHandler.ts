import { createPatient } from '@/lib/nexhealth';
import type { ApiLog, ConversationState, HandlerResult } from '@/types/vapi';
import { mergeState } from '@/lib/utils/state-helpers';

interface CreatePatientToolArguments {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  email: string;
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

export async function handleCreatePatientRecord(
  currentState: ConversationState,
  args: CreatePatientToolArguments, 
  toolCallId: string
): Promise<HandlerResult> {
  // Initialize API log array to capture all external calls
  const apiLog: ApiLog = [];

  try {
    // Call createPatient with the apiLog array
    const { data: responseData, apiLog: updatedApiLog } = await createPatient(
      args,
      'xyz', // subdomain
      318534, // locationId  
      377851148, // providerId
      apiLog
    );

    // Extract the patient ID from the nested successful response
    // responseData contains the NexHealth API response, which has a nested structure
    const nexHealthResponse = responseData as NexHealthPatientResponse;
    const patientId = nexHealthResponse.data?.user?.id || nexHealthResponse.user?.id;

    // Verify that patientId was successfully extracted
    if (!patientId) {
      console.error('[Patient Creation] FAILED: Patient ID missing from NexHealth response. Full response:', responseData);
      throw new Error("Patient ID missing from NexHealth response.");
    }

    console.log('[Patient Creation] SUCCESS: Extracted patientId:', patientId);

    console.log(`[Patient Creation] SUCCESS: Patient "${args.firstName} ${args.lastName}" created successfully in NexHealth with ID: ${patientId}`);

    // Create new state with the patient ID
    const newState = mergeState(currentState, {
      patientDetails: {
        nexhealthPatientId: patientId
      }
    });

    return {
      toolResponse: {
        toolCallId,
        result: { success: true, nexhealthPatientId: patientId, apiLog: updatedApiLog },
        message: {
          type: "request-complete",
          role: "assistant",
          content: `Thank you! I've successfully created a record for you, ${args.firstName}. Now, let's find an appointment time.`
        }
      },
      newState
    };
  } catch (error) {
    console.error('Error creating patient record:', error);
    return {
      toolResponse: {
        toolCallId,
        result: { success: false, apiLog: apiLog }, // Return the API log even on error
        message: {
          type: "request-failed", 
          role: "assistant",
          content: "I'm sorry, I ran into a technical problem while saving your information. Could we please try again in a moment?"
        }
      },
      newState: currentState // Return original state on error
    };
  }
} 