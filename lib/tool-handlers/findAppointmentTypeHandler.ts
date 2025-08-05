import { prisma } from "@/lib/prisma";
import { matchAppointmentTypeIntent } from "@/lib/ai/appointmentMatcher";

import type { HandlerResult, ApiLog } from "@/types/vapi";
import type { ConversationState } from "@/types/laine";
import { mergeState } from '@/lib/utils/state-helpers';

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
  
  // Initialize API log array to capture all external calls
  const apiLog: ApiLog = [];
  
  console.log(`[FindAppointmentTypeHandler] Processing request: "${patientRequest}", patientStatus: "${patientStatus}"`);
  
  // Note: Acknowledgment generation removed for simplified flow
  
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
          result: { apiLog: apiLog },
          message: {
            type: "request-failed",
            role: "assistant",
            content: "I understand you're looking for an appointment, but I couldn't determine the exact type of service you need. Could you please be more specific?"
          }
        },
        newState: currentState
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

    console.log(`[FindAppointmentTypeHandler] Successfully found appointment type: ${matchedAppointmentType.name}`);

    // Create new state with appointment booking details
    const newState = mergeState(currentState, {
              booking: {
        appointmentTypeId: matchedAppointmentType.nexhealthAppointmentTypeId,
        appointmentTypeName: matchedAppointmentType.name,
        spokenName: matchedAppointmentType.spokenName || matchedAppointmentType.name,
        duration: matchedAppointmentType.duration,
        isUrgent: matchedAppointmentType.check_immediate_next_available
      }
    });

    // Log the successful state update for debugging
    console.log('[FindAppointmentTypeHandler] State updated with appointmentTypeId:', newState.booking.appointmentTypeId);
    console.log('[FindAppointmentTypeHandler] Full updated booking state:', JSON.stringify(newState.booking, null, 2));

    // The tool's job is now ONLY to identify the type and update the state.
    // The system prompt will guide the next conversational step.
    // We return a simple success result without a message to ensure the state is saved
    // and let the LLM decide the next step based on the updated state.
    return {
      newState: newState,
      toolResponse: {
        toolCallId: toolId,
        result: {
          success: true,
          appointmentTypeId: matchedAppointmentType.nexhealthAppointmentTypeId,
          appointmentTypeName: matchedAppointmentType.name,
          spokenName: matchedAppointmentType.spokenName || matchedAppointmentType.name,
          duration: matchedAppointmentType.duration,
          isUrgent: matchedAppointmentType.check_immediate_next_available,
          apiLog: apiLog
        }
        // By not including a "message", we allow the LLM to decide the next conversational step
        // based on the updated state and the system prompt's guidance.
      }
    };

  } catch (error) {
    console.error(`[FindAppointmentTypeHandler] Error processing appointment type:`, error);
    return {
      toolResponse: {
        toolCallId: toolId,
        result: { apiLog: apiLog },
        error: "Database error while fetching appointment types."
      },
      newState: currentState
    };
  }
} 