import { ConversationState, NewPatientData } from "@/lib/conversationState";
import { ParsedCreateNewPatientArgs } from "@/lib/tools/createNewPatient";
import { fetchNexhealthAPI } from "@/lib/nexhealth"; // Assuming this is correctly set up
import { addLogEntry } from "@/lib/debugLogStore";

// Define necessary types
interface PracticeInfoForOnboarding {
    id: string; // Practice ID
    name: string; // Practice Name
    nexhealthSubdomain: string; // Needed for NexHealth API calls
    nexhealthLocationId: string; // Needed for NexHealth API calls
}

export interface PatientOnboardingResult {
  success: boolean; // True if the current step/interaction was successful
  outputData: {
    messageForAssistant?: string; // To be populated by messageGenerator
    stage: string; // e.g., 'collecting_name', 'collecting_dob', 'confirming_details', 'patient_created'
    patientDataSnapshot?: NewPatientData;
    nexhealthPatientId?: string | null;
    isComplete: boolean; // True if the entire onboarding is finished (patient created)
    // Add any other data needed by message generator
  };
  error?: string;
}

// Helper to normalize DOB if possible (simple version)
function normalizeDob(dobString: string): string | null {
    try {
        // Attempt to parse common spoken formats or MM/DD/YYYY, M/D/YY etc.
        // This is a placeholder for more robust date parsing logic.
        // For now, we rely on VAPI's LLM or a more specific date tool if complex parsing is needed.
        // If it looks like YYYY-MM-DD, assume it's good.
        if (/^\d{4}-\d{2}-\d{2}$/.test(dobString)) {
            return dobString;
        }
        const date = new Date(dobString);
        if (isNaN(date.getTime())) return null;
        // Check if year is reasonable (e.g., not current year for DOB)
        if (date.getFullYear() >= new Date().getFullYear() -1 && date.getFullYear() <= new Date().getFullYear() +1 ) { // Avoid future dates or too recent
             // if year is current year or next year, it's likely a misinterpretation of "May 5th" as "May 5th, <current_year>"
             // This needs more sophisticated handling, perhaps asking for year explicitly if ambiguous.
             // For now, we'll let it pass and rely on user confirmation.
        }
        return date.toISOString().split('T')[0];
    } catch {
        return null;
    }
}


export async function processPatientOnboarding(
  args: ParsedCreateNewPatientArgs,
  state: ConversationState,
  practiceInfo: PracticeInfoForOnboarding,
  vapiCallId: string
): Promise<PatientOnboardingResult> {
  addLogEntry({
    event: "AI_HANDLER_START",
    source: "patientOnboardingHandler.processPatientOnboarding",
    details: { args, practiceId: practiceInfo.id, initialState: state.getStateSnapshot() }
  }, vapiCallId);

  // 1. Merge incoming data from args into state.newPatientData
  if (args.fullName && (!args.firstName || !args.lastName)) {
    const nameParts = args.fullName.trim().split(/\s+/);
    state.newPatientData.firstName = nameParts[0];
    state.newPatientData.lastName = nameParts.slice(1).join(' ');
  }
  if (args.firstName) state.newPatientData.firstName = args.firstName.trim();
  if (args.lastName) state.newPatientData.lastName = args.lastName.trim();
  if (args.dateOfBirth) {
    const normalized = normalizeDob(args.dateOfBirth);
    if (normalized) state.newPatientData.dob = normalized;
    else { 
        // DOB was provided but couldn't be normalized. Keep current stage to re-ask.
        addLogEntry({event: "DOB_NORMALIZATION_FAILED", source: "patientOnboardingHandler", details: { dobInput: args.dateOfBirth }}, vapiCallId);
        // The message generator should handle asking for DOB again with format hint.
    }
  }
  if (args.phone) state.newPatientData.phone = args.phone.replace(/\D/g, ''); // Digits only
  if (args.email) state.newPatientData.email = args.email.trim().toLowerCase();

  // 2. Determine current stage of data collection / next piece of info needed
  let nextStage = state.currentStage;
  if (!state.newPatientData.firstName || !state.newPatientData.lastName) {
    nextStage = "collecting_name";
  } else if (!state.newPatientData.dob) {
    nextStage = "collecting_dob";
  } else if (!state.newPatientData.phone) {
    nextStage = "collecting_phone";
  } else if (!state.newPatientData.email) {
    nextStage = "collecting_email";
  } else if (!state.newPatientDataConfirmed && !args.userConfirmation) {
    // All data collected, but not yet confirmed by user in this turn
    nextStage = "confirming_all_details";
  } else if (args.userConfirmation === true || state.newPatientDataConfirmed) {
    // User has confirmed all details (either in this turn via args.userConfirmation, or it was already set)
    state.newPatientDataConfirmed = true; // Ensure it's set
    nextStage = "creating_patient_record_in_nexhealth";
  }
  state.setCurrentStage(nextStage);

  addLogEntry({
    event: "ONBOARDING_DATA_MERGED",
    source: "patientOnboardingHandler.processPatientOnboarding",
    details: { currentStage: state.currentStage, newPatientData: state.newPatientData }
  }, vapiCallId);

  // 3. If creating patient record
  if (state.currentStage === "creating_patient_record_in_nexhealth") {
    if (!state.targetNexhealthProviderId) {
      addLogEntry({ event: "AI_HANDLER_ERROR", source: "patientOnboardingHandler", details: { error: "Missing targetNexhealthProviderId for patient creation." }}, vapiCallId);
      return { success: false, outputData: { stage: state.currentStage, isComplete: false, patientDataSnapshot: state.newPatientData }, error: "MISSING_PROVIDER_ID_FOR_CREATION" };
    }

    const patientPayload = {
      provider: {
        provider_id: parseInt(state.targetNexhealthProviderId) // Ensure it's a number
      },
      patient: {
        first_name: state.newPatientData.firstName!,
        last_name: state.newPatientData.lastName!,
        email: state.newPatientData.email!,
        bio: {
          date_of_birth: state.newPatientData.dob!,
          phone_number: state.newPatientData.phone!,
          // gender: "Female" // NexHealth API example had this; decide if needed or make optional/ask
        }
      }
    };

    addLogEntry({ event: "NEXHEALTH_CREATE_PATIENT_START", source: "patientOnboardingHandler", details: { payload: patientPayload } }, vapiCallId);
    try {
      const response = await fetchNexhealthAPI(
        '/patients',
        practiceInfo.nexhealthSubdomain,
        { location_id: practiceInfo.nexhealthLocationId }, // Query params
        'POST',
        patientPayload // Body
      );

      addLogEntry({ event: "NEXHEALTH_CREATE_PATIENT_RESPONSE", source: "patientOnboardingHandler", details: { response } }, vapiCallId);

      if (response && (response.code === true || response.data?.user?.id)) { // Check for success indicators
        const nexhealthPatientId = String(response.data.user.id);
        state.nexhealthPatientId = nexhealthPatientId;
        state.setCurrentStage("patient_created_successfully");
        
        return {
          success: true,
          outputData: {
            stage: state.currentStage,
            patientDataSnapshot: state.newPatientData,
            nexhealthPatientId: state.nexhealthPatientId,
            isComplete: true,
          },
        };
      } else {
        // Handle NexHealth API error (e.g., duplicate patient, validation error from their side)
        const errorDetail = response?.error || response?.description || "NexHealth patient creation failed.";
        console.error("NexHealth patient creation error:", response);
        addLogEntry({ event: "NEXHEALTH_CREATE_PATIENT_ERROR_API", source: "patientOnboardingHandler", details: { error: errorDetail, response } }, vapiCallId);
        state.setCurrentStage("patient_creation_failed_nexhealth");
        // Potentially reset newPatientDataConfirmed to false to allow re-confirmation or correction
        // state.newPatientDataConfirmed = false; 
        return {
          success: false, // The step of creating the patient failed
          outputData: {
            stage: state.currentStage,
            patientDataSnapshot: state.newPatientData,
            isComplete: false,
          },
          error: `NEXHEALTH_ERROR: ${errorDetail}`,
        };
      }
    } catch (apiError) {
      console.error("NexHealth API call exception:", apiError);
      addLogEntry({ event: "NEXHEALTH_CREATE_PATIENT_EXCEPTION", source: "patientOnboardingHandler", details: { error: apiError instanceof Error ? apiError.message : String(apiError) } }, vapiCallId);
      state.setCurrentStage("patient_creation_failed_system");
      return {
        success: false,
        outputData: {
            stage: state.currentStage,
            patientDataSnapshot: state.newPatientData,
            isComplete: false,
        },
        error: "NEXHEALTH_API_EXCEPTION",
      };
    }
  }

  // 4. For other stages (data collection, confirmation)
  return {
    success: true, // The interaction step itself was successful (e.g., data merged)
    outputData: {
      stage: state.currentStage,
      patientDataSnapshot: state.newPatientData,
      isComplete: false, // Onboarding is not yet complete
    },
  };
} 