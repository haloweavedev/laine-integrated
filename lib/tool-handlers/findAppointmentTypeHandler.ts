import { prisma } from "@/lib/prisma";
import { matchAppointmentTypeIntent } from "@/lib/ai/appointmentMatcher";
import { generateAcknowledgment } from '@/lib/ai/acknowledgmentGenerator';
import type { ConversationState, HandlerResult, ApiLog } from "@/types/vapi";
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
  
  // Generate AI-powered acknowledgment based on patient request
  const acknowledgment = await generateAcknowledgment(toolArguments.patientRequest);
  
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
      appointmentBooking: {
        typeId: matchedAppointmentType.nexhealthAppointmentTypeId,
        typeName: matchedAppointmentType.name,
        spokenName: matchedAppointmentType.spokenName || matchedAppointmentType.name,
        duration: matchedAppointmentType.duration,
        patientRequest: patientRequest,
        isImmediateBooking: matchedAppointmentType.check_immediate_next_available
      }
    });

    return {
      toolResponse: {
        toolCallId: toolId,
        result: { // The new structured data payload
          appointmentTypeId: matchedAppointmentType.nexhealthAppointmentTypeId,
          appointmentTypeName: matchedAppointmentType.name,
          spokenName: matchedAppointmentType.spokenName || matchedAppointmentType.name,
          duration: matchedAppointmentType.duration,
          isImmediateBooking: matchedAppointmentType.check_immediate_next_available,
          apiLog: apiLog
        },
        message: { // The new high-fidelity message
          type: "request-complete",
          role: "assistant",
          content: (() => {
            // 1. Use the acknowledgment we generated earlier, providing a default if it's empty.
            const acknowledgmentPhrase = acknowledgment ? `${acknowledgment} ` : "Okay, ";

            // 2. Get the appointment's spoken name for a natural-sounding confirmation.
            const spokenName = matchedAppointmentType.spokenName || matchedAppointmentType.name;

            // 3. Define the next step question dynamically based on appointment type requirements.
            let nextStepQuestion = "";
            if (matchedAppointmentType.check_immediate_next_available) {
              nextStepQuestion = "Since this is time-sensitive, let's find an appointment slot for you first. What day and time are you hoping for?";
              console.log(`[Flow Control] Appointment type "${spokenName}" is flagged for immediate booking. Pivoting to slot check.`);
            } else {
              nextStepQuestion = "First, I'll need to get a few details to create a file for you. What is your first and last name?";
              console.log(`[Flow Control] Standard flow for "${spokenName}". Proceeding to patient creation.`);
            }

            // 4. Combine everything into the final, fluid response string.
            const finalContent = `${acknowledgmentPhrase}I have you down for a ${spokenName}. ${nextStepQuestion}`;

            return finalContent;
          })()
        }
      },
      newState: newState
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