import { createPatient } from '@/lib/nexhealth';
import type { ApiLog } from '@/types/vapi';

interface CreatePatientToolArguments {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  email: string;
}

export async function handleCreatePatientRecord(args: CreatePatientToolArguments, toolCallId: string) { // eslint-disable-line @typescript-eslint/no-unused-vars
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

    // Extract the patient ID from the successful response
    const patientId = responseData.user.id;

    return {
      result: { nexhealthPatientId: patientId, apiLog: updatedApiLog },
      message: {
        type: "request-complete",
        role: "assistant",
        content: `Thank you! I've successfully created a record for ${args.firstName} ${args.lastName}. What can I help you with next?`
      }
    };
  } catch (error) {
    console.error('Error creating patient record:', error);
    return {
      result: { apiLog: apiLog }, // Return the API log even on error
      message: {
        type: "request-failed", 
        role: "assistant",
        content: "I'm sorry, I ran into a technical problem while saving your information. Could we please try again in a moment?"
      }
    };
  }
} 