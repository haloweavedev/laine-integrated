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

  if (!matchedSlot) {
    console.log(`[BookAppointmentHandler] No definitive match found for user selection: "${userSelection}"`);
    // Create a list of the exact times for the AI to read back for clarification
    const presentedTimes = currentState.appointmentBooking.presentedSlots.map(s => 
        DateTime.fromISO(s.time, { zone: practiceTimezone }).toFormat("h:mm a")
    ).join(' or ');

    return {
        toolResponse: {
            toolCallId: toolId,
            result: `I'm sorry, I didn't quite catch that. Of the times I mentioned, would you like the ${presentedTimes}?`
        },
        newState: currentState // Return the state unchanged, awaiting clarification
    };
  }

  // If validation passes, the rest of the function proceeds as before.

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

  // Step 1: Fetch transcript and generate appointment note
  console.log(`[BookAppointmentHandler] Fetching call transcript and generating appointment note`);
  const callLog = await prisma.callLog.findUnique({
      where: { vapiCallId: currentState.callId },
      select: { transcriptText: true }
  });
  const transcript = callLog?.transcriptText || '';
  
  const appointmentNote = await generateAppointmentNote(currentState, transcript);
  
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
  const startTimeLocal = DateTime.fromISO(selectedSlot.time, { zone: practice.timezone || 'America/Chicago' });
  const endTimeLocal = startTimeLocal.plus({ minutes: currentState.appointmentBooking.duration || 30 });

  const appointmentPayload = {
    appt: {
      patient_id: currentState.patientDetails.nexhealthPatientId,
      provider_id: selectedSlot.providerId,
      operatory_id: selectedSlot.operatory_id || 0, // Ensure fallback for safety
      start_time: startTimeLocal.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"), // e.g., ...T14:00:00-05:00
      end_time: endTimeLocal.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ"),
      note: appointmentNote
    }
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
      { location_id: practice.nexhealthLocationId }, // <-- THIS IS THE FIX
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

    const confirmationMessage = `You're all set! I've booked your ${appointmentType} for ${dayName}, ${date} at ${time}. You should receive a confirmation shortly. Is there anything else I can help you with today?`;

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
    
    // Check if the error indicates the slot is already booked
    const errorMessageText = apiError instanceof Error ? apiError.message.toLowerCase() : '';
    if (errorMessageText.includes('slot is not available') || errorMessageText.includes('already booked')) {
        const revertedState: ConversationState = {
            ...currentState,
            currentStage: 'PRESENTING_SLOTS'
        };
        const lastPresented = revertedState.appointmentBooking.presentedSlots?.filter(s => s.time !== revertedState.appointmentBooking.selectedSlot?.time);
        const nextOption = lastPresented && lastPresented.length > 0 ? `I still have the ${DateTime.fromISO(lastPresented[0].time).toFormat('h:mm a')} available, would you like to book that one instead?` : 'Would you like me to search for other times?';

        return {
            toolResponse: {
                toolCallId: toolId,
                result: `I'm so sorry, it looks like that time was just taken. ${nextOption}`
            },
            newState: revertedState
        };
    }
    
    // Fallback to the generic error message for all other API errors
    const errorMessage = "I'm sorry, but there was a system error and I couldn't finalize your booking. Our staff has been notified and will give you a call back shortly to confirm a time. Thank you for your patience.";

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