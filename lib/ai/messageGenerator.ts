import { ConversationState } from "@/lib/conversationState";
import { IntentHandlerResult } from "./intentHandler"; // Assuming this type is exported or defined accessibly
import { FindAppointmentTypeResult } from "./findAppointmentTypeHandler"; // Add this import
import { PatientOnboardingResult } from "./patientOnboardingHandler"; // Assuming type is exported
import { SlotCheckerResult } from "./slotCheckerHandler";
import { addLogEntry } from "@/lib/debugLogStore";
// We will use simple conditional logic for Phase 1. LLM-based generation can be a future enhancement if needed.

export async function generateMessageAfterIntent(
  intentResult: IntentHandlerResult["outputData"],
  state: ConversationState, // Current state after intentHandler has updated it
  vapiCallId: string
): Promise<string> {
  let message = "";
  const { determinedIntent, reasonForVisit, isNewPatientCandidate } = intentResult;

  addLogEntry({
    event: "MESSAGE_GENERATION_START",
    source: "messageGenerator.generateMessageAfterIntent",
    details: { intentResult, currentState: state.getStateSnapshot() }
  }, vapiCallId);

  if (determinedIntent?.startsWith("BOOKING_")) {
    let serviceMention = "";
    if (reasonForVisit === "cleaning") {
      serviceMention = "a cleaning";
    } else if (reasonForVisit === "pain_check") {
      serviceMention = "to address the pain";
    } else if (reasonForVisit === "checkup") {
      serviceMention = "a checkup";
    } else if (reasonForVisit) {
      serviceMention = `for your ${reasonForVisit.replace(/_/g, ' ')}`;
    } else {
      serviceMention = "an appointment";
    }

    if (determinedIntent === "BOOKING_NEW_PATIENT" || isNewPatientCandidate === true) {
      // If reason is known, acknowledge it.
      if (reasonForVisit) {
         message = `Okay, I can help you schedule ${serviceMention}. Since this may be your first time with us, could you please tell me your first and last name?`;
      } else {
         message = `Welcome! I can help you schedule an appointment. To get started, could you please provide your first and last name?`;
      }
      state.setCurrentStage("awaiting_new_patient_name");
    } else if (determinedIntent === "BOOKING_EXISTING_PATIENT" || isNewPatientCandidate === false) {
      message = `Great! I can help you schedule ${serviceMention}. To look up your record, could you please provide your full name and date of birth?`;
      state.setCurrentStage("awaiting_existing_patient_lookup_details");
    } else { // BOOKING_UNKNOWN_PATIENT_STATUS
      message = `Okay, I can help you schedule ${serviceMention}. To get started, are you a new or an existing patient with us?`;
      state.setCurrentStage("awaiting_patient_status_clarification");
    }
  } else if (determinedIntent === "RESCHEDULE_APPOINTMENT" || determinedIntent === "CANCEL_APPOINTMENT") {
    message = "I can help with that. To find your appointment, could you please provide your full name and date of birth?";
    state.setCurrentStage("awaiting_existing_patient_lookup_details");
  } else if (determinedIntent === "GENERAL_INQUIRY") {
    // Acknowledge initial utterance if available and not too long
    const initialUtterance = state.initialUserUtterances?.[0];
    if (initialUtterance && initialUtterance.length < 70) {
        message = `I understand you mentioned "${initialUtterance}". How can I specifically help you with that today?`;
    } else {
        message = "Thanks for calling! How can I help you today?";
    }
    state.setCurrentStage("awaiting_general_inquiry_clarification");
  } else {
    message = "Thanks for calling Laine! How can I assist you today?";
    state.setCurrentStage("unknown_intent_fallback");
  }
  
  addLogEntry({
    event: "MESSAGE_GENERATION_COMPLETE",
    source: "messageGenerator.generateMessageAfterIntent",
    details: { generatedMessage: message, finalState: state.getStateSnapshot() }
  }, vapiCallId);
  
  return message;
}

export async function generateMessageAfterFindAppointmentType(
  findResult: FindAppointmentTypeResult["outputData"],
  state: ConversationState,
  vapiCallId: string
): Promise<string> {
  let message = "";

  addLogEntry({
    event: "MESSAGE_GENERATION_START",
    source: "messageGenerator.generateMessageAfterFindAppointmentType",
    details: { findResult, currentState: state.getStateSnapshot() }
  }, vapiCallId);

  if (findResult.matchFound && findResult.matchedAppointmentName) {
    message = `Okay, a ${findResult.matchedAppointmentName}`;
    if (findResult.matchedAppointmentDuration) {
        message += ` is usually about ${findResult.matchedAppointmentDuration} minutes. `;
    } else {
        message += ". ";
    }
    // Transition to asking for date
    message += `To check availability for this, what date were you thinking of? You can say something like "tomorrow", "next Tuesday", or a specific date like "July 15th".`;
    state.setCurrentStage("awaiting_date_for_slot_check");
  } else {
    // Existing logic for no match or handler-provided error message
    message = findResult.messageForAssistant || "I'm sorry, I couldn't find that specific service. Could you try phrasing it differently, or I can list some common services we offer?";
    state.setCurrentStage("appt_type_not_found_direct_inquiry");
  }
  
  addLogEntry({
    event: "MESSAGE_GENERATION_COMPLETE",
    source: "messageGenerator.generateMessageAfterFindAppointmentType",
    details: { generatedMessage: message, finalState: state.getStateSnapshot() }
  }, vapiCallId);

  return message;
}

export async function generateMessageAfterSlotCheck(
  slotCheckResult: SlotCheckerResult["outputData"],
  state: ConversationState,
  vapiCallId: string
): Promise<string> {
  let message = "";
  const { requestedDateFormatted, slotsFound, presentedSlots, availableSlotsCount } = slotCheckResult;

  addLogEntry({
    event: "MESSAGE_GENERATION_START",
    source: "messageGenerator.generateMessageAfterSlotCheck",
    details: { slotCheckResult, currentState: state.getStateSnapshot() }
  }, vapiCallId);

  if (slotsFound && presentedSlots && presentedSlots.length > 0) {
    message = `Okay, for ${requestedDateFormatted}, I have the following times available: ${presentedSlots.join(", ")}.`;
    if (availableSlotsCount && availableSlotsCount > presentedSlots.length) {
      message += ` I also have other times.`;
    }
    message += ` Do any of these work for you? Or would you like to hear more options for this date, or try a different date?`;
    state.setCurrentStage("awaiting_slot_selection_or_new_date");
  } else {
    message = `I'm sorry, I don't see any available slots for ${requestedDateFormatted}. Would you like to try a different date?`;
    state.setCurrentStage("awaiting_new_date_after_no_slots");
  }
  
  addLogEntry({
    event: "MESSAGE_GENERATION_COMPLETE",
    source: "messageGenerator.generateMessageAfterSlotCheck",
    details: { generatedMessage: message, finalState: state.getStateSnapshot() }
  }, vapiCallId);
  return message;
}

export async function generateMessageForPatientOnboarding(
  onboardingResult: PatientOnboardingResult["outputData"],
  state: ConversationState, // Current state after patientOnboardingHandler has updated it
  vapiCallId: string
): Promise<string> {
  let message = "";
  const { stage, patientDataSnapshot, nexhealthPatientId } = onboardingResult;

  addLogEntry({
    event: "MESSAGE_GENERATION_START",
    source: "messageGenerator.generateMessageForPatientOnboarding",
    details: { onboardingResult, currentState: state.getStateSnapshot() }
  }, vapiCallId);

  switch (stage) {
    case "collecting_name":
      message = "To get you registered as a new patient, could you please tell me your first and last name?";
      break;
    case "collecting_dob":
      // Check if name was just provided to make it more natural
      const namePart = patientDataSnapshot?.firstName ? `, ${patientDataSnapshot.firstName}` : "";
      message = `Thanks${namePart}. And what is your date of birth, including the year?`;
      break;
    case "collecting_phone":
      message = "Got it. What's the best phone number to reach you at?";
      break;
    case "collecting_email":
      message = "Perfect. And lastly, what is your email address?";
      break;
    case "confirming_all_details":
      if (patientDataSnapshot) {
        const { firstName, lastName, dob, phone, email } = patientDataSnapshot;
        // Format DOB and phone for display if needed
        const displayDob = dob ? new Date(dob + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : "not provided";
        const displayPhone = phone ? `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6)}` : "not provided";
        message = `Okay, just to confirm: I have your name as ${firstName || ''} ${lastName || ''}, date of birth ${displayDob}, phone number ${displayPhone}, and email ${email || "not provided"}. Is all that correct?`;
      } else {
        message = "I seem to be missing some details. Let's try that again. What's your full name?"; // Fallback
        state.setCurrentStage("collecting_name"); // Reset stage
      }
      break;
    case "patient_created_successfully":
      const appointmentName = state.matchedAppointmentName || "your appointment";
      message = `Great, ${patientDataSnapshot?.firstName || 'you'}'re all set up in our system! Your patient ID is ${nexhealthPatientId}. Now, about scheduling ${appointmentName}...`;
      // Next step would be to ask for date/time for the appointment.
      // For Phase 3, we stop here for patient creation. Booking flow is next.
      // Example: message += " What day and time were you thinking of for your appointment?"
      // state.setCurrentStage("awaiting_booking_date_time");
      break;
    case "patient_creation_failed_nexhealth":
      message = "I encountered an issue while creating your patient record with our scheduling system. Would you like to try confirming the details again, or I can connect you with the office?";
      break;
    case "patient_creation_failed_system":
    case "MISSING_PROVIDER_ID_FOR_CREATION": // Handler error
      message = "I'm having a technical difficulty creating your patient profile right now. Please try again in a few moments, or you can call the office directly to get registered.";
      break;
    default:
      message = "I'm not sure what information I need next. Could you please tell me your full name to get started with registration?";
      state.setCurrentStage("collecting_name"); // Default to restarting collection
  }
  
  addLogEntry({
    event: "MESSAGE_GENERATION_COMPLETE",
    source: "messageGenerator.generateMessageForPatientOnboarding",
    details: { generatedMessage: message, finalState: state.getStateSnapshot() }
  }, vapiCallId);

  return message;
}