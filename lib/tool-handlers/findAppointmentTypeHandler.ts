import { prisma } from "@/lib/prisma";
import { matchAppointmentTypeIntent } from "@/lib/ai/appointmentMatcher";
import type { ConversationState, HandlerResult, ApiLog } from "@/types/vapi";

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

    // Detect sentiment and urgency based on keywords in patient request
    const URGENT_KEYWORDS = ['pain', 'toothache', 'emergency', 'hurts', 'broken', 'urgent', 'abscess', 'swelling', 'infection'];
    
    const requestLower = patientRequest.toLowerCase();
    const isUrgent = URGENT_KEYWORDS.some(keyword => requestLower.includes(keyword));

    console.log(`[FindAppointmentTypeHandler] Successfully found appointment type: ${matchedAppointmentType.name}`);

    return {
      toolResponse: {
        toolCallId: toolId,
        result: { // The new structured data payload
          appointmentTypeId: matchedAppointmentType.nexhealthAppointmentTypeId,
          appointmentTypeName: matchedAppointmentType.name,
          spokenName: matchedAppointmentType.spokenName || matchedAppointmentType.name,
          duration: matchedAppointmentType.duration,
          isUrgent: isUrgent,
          isImmediateBooking: matchedAppointmentType.check_immediate_next_available,
          apiLog: apiLog
        },
        message: { // The new high-fidelity message
          type: "request-complete",
          role: "assistant",
          content: `Okay, I've noted you're looking for a ${matchedAppointmentType.spokenName || matchedAppointmentType.name}.`
        }
      },
      newState: currentState // We will update the state in the webhook, not here.
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