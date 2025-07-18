import { prisma } from "@/lib/prisma";
import { matchAppointmentTypeIntent, generateAppointmentConfirmationMessage, generateUrgentAppointmentConfirmationMessage, generateWelcomeAppointmentConfirmationMessage } from "@/lib/ai/appointmentMatcher";
import type { ConversationState, VapiToolResult, HandlerResult } from "@/types/vapi";

interface FindAppointmentTypeArgs {
  patientRequest: string;
  patientStatus?: string;
}

export async function handleFindAppointmentType(
  currentState: ConversationState,
  toolArguments: FindAppointmentTypeArgs,
  toolId: string
): Promise<HandlerResult> {
  const { patientRequest, patientStatus } = toolArguments;
  
  console.log(`[FindAppointmentTypeHandler] Processing request: "${patientRequest}", patientStatus: "${patientStatus}"`);
  
  try {
    if (!currentState.practiceId) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Practice configuration not found."
        },
        newState: currentState
      };
    }

    if (!patientRequest) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Missing patientRequest parameter."
        },
        newState: currentState
      };
    }

    console.log(`[FindAppointmentTypeHandler] Using practice: ${currentState.practiceId}`);

    // Fetch appointment types with keywords for this practice (only bookable online)
    const dbAppointmentTypes = await prisma.appointmentType.findMany({
      where: {
        practiceId: currentState.practiceId,
        bookableOnline: true, // Only include appointment types that are active for online booking
        AND: [
          { keywords: { not: null } },
          { keywords: { not: "" } }
        ]
      },
      select: {
        nexhealthAppointmentTypeId: true,
        name: true,
        duration: true,
        keywords: true,
        check_immediate_next_available: true,
        spokenName: true
      }
    });

    if (!dbAppointmentTypes || dbAppointmentTypes.length === 0) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "No suitable appointment types are configured for matching in this practice."
        },
        newState: currentState
      };
    }

    console.log(`[FindAppointmentTypeHandler] Found ${dbAppointmentTypes.length} appointment types with keywords`);

    // Use AI to match the patient request to appointment types
    const matchedApptId = await matchAppointmentTypeIntent(
      patientRequest,
      dbAppointmentTypes.map(at => ({
        id: at.nexhealthAppointmentTypeId,
        name: at.name,
        keywords: at.keywords || "",
      }))
    );

    if (!matchedApptId) {
      console.log(`[FindAppointmentTypeHandler] No appointment type matched for request: "${patientRequest}"`);

      return {
        toolResponse: {
          toolCallId: toolId,
          result: "I understand you're looking for an appointment, but I couldn't determine the exact type of service you need. Could you please be more specific about what you'd like to schedule?"
        },
        newState: {
          ...currentState,
          currentStage: 'IDENTIFYING_APPOINTMENT_TYPE'
        }
      };
    }

    // Find the matched appointment type's details 
    const matchedAppointmentType = dbAppointmentTypes.find(at => 
      at.nexhealthAppointmentTypeId === matchedApptId
    );

    if (!matchedAppointmentType) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Error retrieving appointment type details."
        },
        newState: currentState
      };
    }

    // Detect sentiment and urgency based on keywords in patient request
    const URGENT_KEYWORDS = ['pain', 'toothache', 'emergency', 'hurts', 'broken', 'urgent', 'abscess', 'swelling', 'infection'];
    const POSITIVE_KEYWORDS = ['new patient', 'just moved', 'recommendation', 'referred', 'first time', 'new to the area', 'someone recommended'];
    
    const requestLower = patientRequest.toLowerCase();
    const isUrgent = URGENT_KEYWORDS.some(keyword => requestLower.includes(keyword));
    const isNewPatientOrPositive = POSITIVE_KEYWORDS.some(keyword => requestLower.includes(keyword));

    // Generate natural confirmation message based on detected sentiment
    let generatedMessage: string;
    
    if (isUrgent) {
      generatedMessage = await generateUrgentAppointmentConfirmationMessage(
        patientRequest,
        matchedAppointmentType.name,
        matchedAppointmentType.spokenName || matchedAppointmentType.name,
        matchedAppointmentType.duration
      );
    } else if (isNewPatientOrPositive) {
      generatedMessage = await generateWelcomeAppointmentConfirmationMessage(
        patientRequest,
        matchedAppointmentType.name,
        matchedAppointmentType.spokenName || matchedAppointmentType.name,
        matchedAppointmentType.duration
      );
    } else {
      generatedMessage = await generateAppointmentConfirmationMessage(
        patientRequest,
        matchedAppointmentType.name,
        matchedAppointmentType.spokenName || matchedAppointmentType.name,
        matchedAppointmentType.duration
      );
    }

    // Update state with the matched appointment type
    const newState: ConversationState = {
      ...currentState,
      currentStage: 'AWAITING_PATIENT_IDENTIFICATION',
      appointmentBooking: {
        ...currentState.appointmentBooking,
        typeId: matchedAppointmentType.nexhealthAppointmentTypeId,
        typeName: matchedAppointmentType.name,
        spokenName: matchedAppointmentType.spokenName || matchedAppointmentType.name,
        duration: matchedAppointmentType.duration,
        patientRequest: patientRequest,
        isUrgent: isUrgent,
        isImmediateBooking: matchedAppointmentType.check_immediate_next_available
      }
    };

    const toolResponse: VapiToolResult = {
      toolCallId: toolId,
      result: generatedMessage
    };

    console.log(`[FindAppointmentTypeHandler] Successfully found appointment type: ${matchedAppointmentType.name}`);

    // For urgent appointments, immediately chain to checkAvailableSlots
    if (isUrgent) {
      console.log(`[FindAppointmentTypeHandler] Urgent appointment detected, chaining to checkAvailableSlots`);
      return {
        toolResponse,
        newState,
        nextTool: {
          toolName: 'checkAvailableSlots',
          toolArguments: {} // No specific arguments needed for urgent flow
        }
      };
    }

    return {
      toolResponse,
      newState
    };

  } catch (error) {
    console.error(`[FindAppointmentTypeHandler] Error processing appointment type:`, error);
    return {
      toolResponse: {
        toolCallId: toolId,
        error: "Database error while fetching appointment types."
      },
      newState: currentState
    };
  }
} 