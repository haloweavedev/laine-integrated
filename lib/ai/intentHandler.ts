import { ConversationState } from "@/lib/conversationState";
import { ParsedGetIntentArgs } from "@/lib/tools/getIntent"; // Args from VAPI tool
import { addLogEntry } from "@/lib/debugLogStore";
// Potentially import a shared ToolHandlerResult type if defined, e.g., from lib/ai/types.ts
// For now, define it locally or inline in the return type.

export interface IntentHandlerResult {
  success: boolean;
  outputData: {
    messageForAssistant?: string; // To be populated by messageGenerator
    determinedIntent: string | null;
    reasonForVisit: string | null;
    isNewPatientCandidate: boolean | null;
    // Add any other data needed by the message generator or subsequent tools
  };
  error?: string;
}

// Define a simplified PracticeInfo type for what the handler needs
interface PracticeInfo {
    id: string;
    name: string;
    // Add other practice-specific details if needed by intent logic
}

export async function processGetIntent(
  args: ParsedGetIntentArgs,
  state: ConversationState,
  practiceInfo: PracticeInfo, // Simplified practice context
  vapiCallId: string
): Promise<IntentHandlerResult> {
  addLogEntry({
    event: "AI_HANDLER_START",
    source: "intentHandler.processGetIntent",
    details: { args, initialState: state.getStateSnapshot() }
  }, vapiCallId);

  state.setInitialUserUtterances([args.userRawRequest]); // Store the raw request

  const utterance = args.userRawRequest.toLowerCase();
  let determinedIntent: string | null = null;
  let reasonForVisit: string | null = null;
  let isNewPatientCandidate: boolean | null = null;

  // --- Simple Keyword-Based Intent & Reason Parsing ---
  // This is a starting point. Can be enhanced with more sophisticated NLP/LLM later.

  // Check for new/existing patient indicators first
  if (utterance.includes("new patient") || utterance.includes("first time") || utterance.includes("never been")) {
    isNewPatientCandidate = true;
  } else if (utterance.includes("existing patient") || utterance.includes("been there before") || utterance.includes("returning patient")) {
    isNewPatientCandidate = false; // Explicitly existing
  }

  // Check for booking-related keywords
  const bookingKeywords = ["book", "schedule", "appointment", "make an appointment", "set up", "arrange"];
  if (bookingKeywords.some(kw => utterance.includes(kw))) {
    if (isNewPatientCandidate === true) {
      determinedIntent = "BOOKING_NEW_PATIENT";
    } else if (isNewPatientCandidate === false) {
      determinedIntent = "BOOKING_EXISTING_PATIENT";
    } else {
      determinedIntent = "BOOKING_UNKNOWN_PATIENT_STATUS";
    }
  } else if (utterance.includes("reschedule") || utterance.includes("change my appointment")) {
    determinedIntent = "RESCHEDULE_APPOINTMENT";
  } else if (utterance.includes("cancel")) {
    determinedIntent = "CANCEL_APPOINTMENT";
  }
  // Add more general inquiry checks if needed

  // Reason for visit (simple examples)
  if (utterance.includes("cleaning") || utterance.includes("clean my teeth")) {
    reasonForVisit = "cleaning";
  } else if (utterance.includes("toothache") || utterance.includes("pain") || utterance.includes("hurts")) {
    reasonForVisit = "pain_check";
    if (!determinedIntent && determinedIntent !== "BOOKING_NEW_PATIENT" && determinedIntent !== "BOOKING_EXISTING_PATIENT") {
         determinedIntent = determinedIntent || "BOOKING_UNKNOWN_PATIENT_STATUS"; // Default to booking if pain is mentioned
    }
  } else if (utterance.includes("checkup") || utterance.includes("exam")) {
    reasonForVisit = "checkup";
  }
  // ... add more reason keywords

  // If no specific booking intent but a reason was found, infer booking
  if (!determinedIntent && reasonForVisit) {
    if (isNewPatientCandidate === true) {
        determinedIntent = "BOOKING_NEW_PATIENT";
    } else {
        determinedIntent = "BOOKING_UNKNOWN_PATIENT_STATUS";
    }
  }
  
  // Fallback intent
  if (!determinedIntent) {
    determinedIntent = "GENERAL_INQUIRY";
  }

  // Update ConversationState
  state.determinedIntent = determinedIntent;
  state.reasonForVisit = reasonForVisit;
  state.isNewPatientCandidate = isNewPatientCandidate;
  state.setCurrentStage(`intent_analyzed:${determinedIntent}`);

  addLogEntry({
    event: "AI_HANDLER_STATE_UPDATED",
    source: "intentHandler.processGetIntent",
    details: { 
        determinedIntent, 
        reasonForVisit, 
        isNewPatientCandidate,
        finalState: state.getStateSnapshot() 
    }
  }, vapiCallId);

  return {
    success: true,
    outputData: {
      // messageForAssistant will be populated by messageGenerator in the next step/route
      determinedIntent,
      reasonForVisit,
      isNewPatientCandidate,
    },
  };
} 