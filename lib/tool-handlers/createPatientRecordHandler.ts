import { createPatient } from '@/lib/nexhealth';
import { mergeState } from '@/lib/utils/state-helpers';
import type { ConversationState, HandlerResult, ApiLog } from '@/types/vapi';
import { prisma } from '@/lib/prisma';

interface CreatePatientToolArguments {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  email: string;
}

export async function handleCreatePatientRecord(
  currentState: ConversationState,
  args: CreatePatientToolArguments,
  toolCallId: string
): Promise<HandlerResult> {
  console.log('[CreatePatientRecordHandler] Starting patient creation with args:', args);
  const apiLog: ApiLog = [];

  try {
    // We need practice details to make the API call
    const practice = await prisma.practice.findUnique({
      where: { id: currentState.practiceId },
      select: { nexhealthSubdomain: true, nexhealthLocationId: true }
    });

    if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      throw new Error('Practice configuration for NexHealth is missing.');
    }
    
    // A default provider ID is needed for patient creation in NexHealth.
    // This should eventually come from a more sophisticated provider selection logic.
    const DEFAULT_PROVIDER_ID = 377851148;

    const { data: responseData, apiLog: updatedApiLog } = await createPatient(
      args,
      practice.nexhealthSubdomain,
      parseInt(practice.nexhealthLocationId, 10),
      DEFAULT_PROVIDER_ID,
      apiLog
    );

    const patientId = responseData.user.id;
    console.log(`[CreatePatientRecordHandler] SUCCESS: Patient created with NexHealth ID: ${patientId}`);

    // Use mergeState to reliably update the state
    const newState = mergeState(currentState, {
      patientDetails: {
        nexhealthPatientId: patientId
      }
    });

    return {
      toolResponse: {
        toolCallId,
        result: {
          success: true, // Correctly signal success
          nexhealthPatientId: patientId,
          apiLog: updatedApiLog
        }
      },
      newState
    };
  } catch (error) {
    console.error('[CreatePatientRecordHandler] Error creating patient record:', error);
    return {
      toolResponse: {
        toolCallId,
        error: "I'm sorry, I ran into a technical problem while saving your information. Our staff has been notified.",
        result: {
          success: false, // Correctly signal failure
          apiLog: apiLog 
        }
      },
      newState: currentState // Return original state on failure
    };
  }
} 