import { prisma } from "@/lib/prisma";
import { matchAppointmentTypeIntent, generateAppointmentConfirmationMessage } from "@/lib/ai/appointmentMatcher";
import type { ConversationState, VapiToolResult } from "@/types/vapi";

interface FindAppointmentTypeArgs {
  patientRequest: string;
  patientStatus?: string;
}

interface HandlerResult {
  toolResponse: VapiToolResult;
  newState: ConversationState;
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

    // Fetch appointment types with keywords for this practice
    const dbAppointmentTypes = await prisma.appointmentType.findMany({
      where: {
        practiceId: currentState.practiceId,
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

    // Generate natural confirmation message
    const generatedMessage = await generateAppointmentConfirmationMessage(
      patientRequest,
      matchedAppointmentType.name, // Official Name
      matchedAppointmentType.spokenName || matchedAppointmentType.name, // Spoken Name (fallback to official if null)
      matchedAppointmentType.duration
    );

    // Update state with the matched appointment type
    const newState: ConversationState = {
      ...currentState,
      currentStage: 'CONFIRMING_APPOINTMENT_TYPE',
      appointmentBooking: {
        ...currentState.appointmentBooking,
        typeId: matchedAppointmentType.nexhealthAppointmentTypeId,
        typeName: matchedAppointmentType.name,
        spokenName: matchedAppointmentType.spokenName || matchedAppointmentType.name,
        duration: matchedAppointmentType.duration,
        patientRequest: patientRequest
      }
    };

    const toolResponse: VapiToolResult = {
      toolCallId: toolId,
      result: generatedMessage
    };

    console.log(`[FindAppointmentTypeHandler] Successfully found appointment type: ${matchedAppointmentType.name}`);

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