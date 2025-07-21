import { createPatient } from '@/lib/nexhealth';

interface CreatePatientToolArguments {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  email: string;
}

export async function handleCreatePatientRecord(args: CreatePatientToolArguments, toolCallId: string) { // eslint-disable-line @typescript-eslint/no-unused-vars
  try {
    // Call createPatient with hardcoded values from the webhook for now
    const responseData = await createPatient(
      args,
      'xyz', // subdomain
      318534, // locationId  
      377851148 // providerId
    );

    // Extract the patient ID from the successful response
    const patientId = responseData.data.user.id;

    return {
      result: { nexhealthPatientId: patientId },
      message: {
        type: "request-complete",
        role: "assistant",
        content: `Thank you! I've successfully created a record for ${args.firstName} ${args.lastName}. What can I help you with next?`
      }
    };
  } catch (error) {
    console.error('Error creating patient record:', error);
    return {
      message: {
        type: "request-failed", 
        role: "assistant",
        content: "I'm sorry, I ran into a technical problem while saving your information. Could we please try again in a moment?"
      }
    };
  }
} 