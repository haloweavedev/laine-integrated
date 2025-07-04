import { prisma } from "@/lib/prisma";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import { matchUserSelectionToSlot } from "@/lib/ai/slotMatcher";
import { generateAppointmentNote } from "@/lib/ai/summaryHelper";
import { generateConfirmationMessage } from "@/lib/ai/confirmationHelper";
import { DateTime } from "luxon";
import type { ConversationState, VapiToolResult } from "@/types/vapi";

interface BookAppointmentArgs {
  userSelection: string;
}

interface HandlerResult {
  toolResponse: VapiToolResult;
  newState: ConversationState;
}

export async function handleBookAppointment(
  currentState: ConversationState,
  toolArguments: BookAppointmentArgs,
  toolId: string
): Promise<HandlerResult> {
  const { userSelection } = toolArguments;
  
  console.log(`[BookAppointmentHandler] Processing user selection: "${userSelection}"`);
  console.log(`[BookAppointmentHandler] Current stage: ${currentState.currentStage}`);
  
  try {
    // Two-step booking logic based on conversation stage
    if (currentState.currentStage !== 'READY_FOR_BOOKING') {
      // FIRST CALL: Match slot and generate confirmation message
      return await handleFirstBookingStep(currentState, userSelection, toolId);
    } else {
      // SECOND CALL: Actually book the appointment
      return await handleSecondBookingStep(currentState, userSelection, toolId);
    }
  } catch (error) {
    console.error(`[BookAppointmentHandler] Unexpected error in booking handler:`, error);
    return {
      toolResponse: {
        toolCallId: toolId,
        error: "An unexpected error occurred while processing your booking request."
      },
      newState: currentState
    };
  }
}

/**
 * First step: Match the user's selection to a slot and generate confirmation message
 */
async function handleFirstBookingStep(
  currentState: ConversationState,
  userSelection: string,
  toolId: string
): Promise<HandlerResult> {
  console.log(`[BookAppointmentHandler] First booking step: matching slot and generating confirmation`);
  
  // Validate that we have presented slots to match against
  if (!currentState.appointmentBooking.presentedSlots || 
      currentState.appointmentBooking.presentedSlots.length === 0) {
    return {
      toolResponse: {
        toolCallId: toolId,
        error: "No appointment slots have been presented yet. Please check available slots first."
      },
      newState: currentState
    };
  }

  // Step 1: Get practice timezone for slot matching
  const practice = await prisma.practice.findUnique({
    where: { id: currentState.practiceId },
    select: { timezone: true }
  });

  const practiceTimezone = practice?.timezone || 'America/Chicago';

  // Step 2: Match the slot using AI
  console.log(`[BookAppointmentHandler] Matching user selection against ${currentState.appointmentBooking.presentedSlots.length} presented slots`);
  
  const matchedSlot = await matchUserSelectionToSlot(
    userSelection,
    currentState.appointmentBooking.presentedSlots,
    practiceTimezone
  );

  // Step 2: Validate the match
  if (!matchedSlot) {
    console.log(`[BookAppointmentHandler] No match found for user selection: "${userSelection}"`);
    return {
      toolResponse: {
        toolCallId: toolId,
        result: "I'm sorry, I didn't quite catch that. Which of the time slots I mentioned would you like?"
      },
      newState: currentState
    };
  }

  console.log(`[BookAppointmentHandler] Successfully matched slot: ${matchedSlot.time}`);

  // Step 3: Update state with selected slot and move to READY_FOR_BOOKING
  const updatedState: ConversationState = {
    ...currentState,
    currentStage: 'READY_FOR_BOOKING',
    appointmentBooking: {
      ...currentState.appointmentBooking,
      selectedSlot: matchedSlot
    }
  };

  // Step 4: Generate confirmation message
  console.log(`[BookAppointmentHandler] Generating confirmation message`);
  const confirmationMessage = await generateConfirmationMessage(updatedState);

  const toolResponse: VapiToolResult = {
    toolCallId: toolId,
    result: confirmationMessage
  };

  console.log(`[BookAppointmentHandler] First step complete - awaiting user confirmation`);

  return {
    toolResponse,
    newState: updatedState
  };
}

/**
 * Second step: Actually book the appointment after user confirms
 */
async function handleSecondBookingStep(
  currentState: ConversationState,
  userSelection: string,
  toolId: string
): Promise<HandlerResult> {
  console.log(`[BookAppointmentHandler] Second booking step: finalizing appointment`);
  
  // Validate that we have a selected slot
  if (!currentState.appointmentBooking.selectedSlot) {
    console.error(`[BookAppointmentHandler] No selected slot found in READY_FOR_BOOKING state`);
    return {
      toolResponse: {
        toolCallId: toolId,
        error: "Something went wrong with your slot selection. Please try again."
      },
      newState: currentState
    };
  }

  // Step 1: Generate appointment note
  console.log(`[BookAppointmentHandler] Generating appointment note`);
  const appointmentNote = await generateAppointmentNote(currentState);
  
  // Log the generated note to database
  await prisma.toolLog.updateMany({
    where: { toolCallId: toolId },
    data: { result: `[AI Summary] Generated Note: "${appointmentNote}"` }
  });
  console.log(`[DB Log] Logged generated appointment note for tool call ${toolId}.`);

  // Step 2: Get practice configuration for API call
  const practice = await prisma.practice.findUnique({
    where: { id: currentState.practiceId },
    select: {
      nexhealthSubdomain: true,
      nexhealthLocationId: true,
      timezone: true
    }
  });

  if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
    return {
      toolResponse: {
        toolCallId: toolId,
        error: "Practice configuration not found for booking."
      },
      newState: currentState
    };
  }

  // Step 3: Construct NexHealth payload
  const selectedSlot = currentState.appointmentBooking.selectedSlot;
  const startTimeUTC = DateTime.fromISO(selectedSlot.time).toUTC();
  const endTimeUTC = startTimeUTC.plus({ minutes: currentState.appointmentBooking.duration || 30 });

  const appointmentPayload = {
    patient_id: currentState.patientDetails.nexhealthPatientId,
    provider_id: selectedSlot.providerId,
    operatory_id: selectedSlot.operatory_id || 0,
    start_time: startTimeUTC.toFormat("yyyy-MM-dd'T'HH:mm:ss'+0000'"),
    end_time: endTimeUTC.toFormat("yyyy-MM-dd'T'HH:mm:ss'+0000'"),
    note: appointmentNote
  };

  console.log(`[BookAppointmentHandler] Constructed appointment payload:`, appointmentPayload);
  
  // Log the payload to database for debugging
  const payloadToLog = { ...appointmentPayload };
  await prisma.toolLog.updateMany({
    where: { toolCallId: toolId },
    data: { result: `[NexHealth Request] Sending payload: ${JSON.stringify(payloadToLog)}` }
  });
  console.log(`[DB Log] Logged NexHealth request payload for tool call ${toolId}.`);

  // Step 4: Make the API call
  try {
    console.log(`[BookAppointmentHandler] Calling NexHealth API to create appointment`);
    
    const apiResponse = await fetchNexhealthAPI(
      '/appointments',
      practice.nexhealthSubdomain,
      {},
      'POST',
      appointmentPayload
    );

    console.log(`[BookAppointmentHandler] Successfully created appointment:`, apiResponse);

    // Step 5: Handle success
    const finalState: ConversationState = {
      ...currentState,
      currentStage: 'BOOKING_CONFIRMED'
    };

    // Format the time for the confirmation message
    const confirmationTime = DateTime.fromISO(selectedSlot.time);
    const dayName = confirmationTime.toFormat('cccc'); // Full day name
    const time = confirmationTime.toFormat('h:mm a'); // 2:00 PM format
    const date = confirmationTime.toFormat('MMMM d'); // December 23 format
    const appointmentType = currentState.appointmentBooking.spokenName || 
                           currentState.appointmentBooking.typeName || 
                           'appointment';

    const confirmationMessage = `You're all set! I've booked your ${appointmentType} for ${dayName}, ${date} at ${time}. You should receive a confirmation shortly. Is there anything else I can help you with?`;

    const toolResponse: VapiToolResult = {
      toolCallId: toolId,
      result: confirmationMessage
    };

    console.log(`[BookAppointmentHandler] Booking confirmed successfully`);

    return {
      toolResponse,
      newState: finalState
    };

  } catch (apiError) {
    // Step 5: Handle API failure
    console.error(`[BookAppointmentHandler] Failed to create appointment:`, apiError);
    
    const errorMessage = "I'm sorry, there was a system error and I couldn't finalize your booking. Please call the office directly to schedule your appointment. Is there anything else I can help you with?";

    const toolResponse: VapiToolResult = {
      toolCallId: toolId,
      result: errorMessage
    };

    // Return to previous state (before the failed booking attempt)
    const revertedState: ConversationState = {
      ...currentState,
      currentStage: 'PRESENTING_SLOTS'
    };

    return {
      toolResponse,
      newState: revertedState
    };
  }
}