import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import { DateTime } from "luxon";

export const bookAppointmentSchema = z.object({
  selectedTime: z.string()
    .min(1)
    .describe(`Time patient selected from available options. Include AM/PM. Examples: "I'll take 8 AM" → "8:00 AM", "The 2:30 slot" → "2:30 PM"`),
  patientId: z.string()
    .min(1)
    .describe(`CRITICAL: Numeric patient ID (e.g., "381872342") from previous find_patient_in_ehr or create_new_patient tool call. NOT patient name. Required for EHR linking. Note: ConversationState is the primary source for this value.`),
  appointmentTypeId: z.string()
    .min(1)
    .describe("Appointment type ID from successful find_appointment_type tool call data.appointment_type_id field. Note: ConversationState is the primary source for this value."),
  requestedDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .describe("Appointment date in YYYY-MM-DD format from check_available_slots or user input. Note: ConversationState is the primary source for this value."),
  durationMinutes: z.number()
    .min(1)
    .describe("Appointment duration in minutes from find_appointment_type tool call data.duration_minutes field. Note: ConversationState is the primary source for this value."),
  userHasConfirmedBooking: z.boolean().optional().describe("Set to true if the user has explicitly confirmed all booking details presented by Laine.")
});

const bookAppointmentTool: ToolDefinition<typeof bookAppointmentSchema> = {
  name: "book_appointment",
  description: "Books the appointment in the EHR system as the FINAL step. Call after: patient identity confirmed, appointment type determined, available slots checked, and patient selected time. Requires selectedTime, patientId, appointmentTypeId, requestedDate, durationMinutes. Returns appointment_id, booked_date, booked_time.",
  schema: bookAppointmentSchema,
  prerequisites: [
    {
      argName: 'patientId',
      askUserMessage: "To book this appointment, I'll need to confirm your patient details. Could you please spell out your full name and provide your date of birth?"
    },
    {
      argName: 'appointmentTypeId',
      askUserMessage: "And what type of appointment are we booking today?"
    },
    {
      argName: 'requestedDate',
      askUserMessage: "For which date are we scheduling this appointment?"
    },
    {
      argName: 'selectedTime',
      askUserMessage: "And what time did you decide on for the appointment?"
    },
    {
      argName: 'durationMinutes',
      askUserMessage: "I also need to confirm the appointment duration. What type of service was this for again?"
    }
  ],
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice, vapiCallId, conversationState } = context;
    
    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return {
        success: false,
        error_code: "PRACTICE_CONFIG_MISSING",
        message_to_patient: "", // Will be filled by dynamic generation
        details: "Missing practice configuration"
      };
    }

    if (!practice.savedProviders || practice.savedProviders.length === 0) {
      return {
        success: false,
        error_code: "NO_SAVED_PROVIDERS",
        message_to_patient: "", // Will be filled by dynamic generation
        details: "No providers configured"
      };
    }

    try {
      console.log(`[bookAppointment] Starting booking process...`);

      // Source ALL necessary booking parameters from ConversationState
      const patientId = conversationState.identifiedPatientId;
      const appointmentTypeId_LaineCUID = conversationState.determinedAppointmentTypeId;
      const requestedDate = conversationState.requestedDate;
      const durationMinutes = conversationState.determinedDurationMinutes;
      const selectedTimeSlotObject = conversationState.selectedTimeSlot;
      const callSummaryForNote = conversationState.callSummaryForNote;

      // Critical Validation: Check if any essential values from ConversationState are null or undefined
      if (!patientId) {
        return {
          success: false,
          error_code: "INCOMPLETE_BOOKING_CONTEXT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Patient ID missing from conversation context"
        };
      }

      if (!appointmentTypeId_LaineCUID) {
        return {
          success: false,
          error_code: "INCOMPLETE_BOOKING_CONTEXT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Appointment type ID missing from conversation context"
        };
      }

      if (!requestedDate) {
        return {
          success: false,
          error_code: "INCOMPLETE_BOOKING_CONTEXT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Requested date missing from conversation context"
        };
      }

      if (!durationMinutes) {
        return {
          success: false,
          error_code: "INCOMPLETE_BOOKING_CONTEXT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Duration minutes missing from conversation context"
        };
      }

      // Handle selectedTime argument to find and confirm the matching slot
      let selectedTimeDisplay: string;
      let selectedTimeRaw: string;

      if (args.selectedTime) {
        // Use args.selectedTime to find matching slot within conversationState.availableSlotsForDate
        if (!conversationState.availableSlotsForDate) {
          return {
            success: false,
            error_code: "SLOT_NOT_RECOGNIZED_OR_EXPIRED",
            message_to_patient: "", // Will be filled by dynamic generation
            details: "No available slots found in conversation state"
          };
        }

        // Find matching slot based on display_time
        const matchedSlot = (conversationState.availableSlotsForDate as Record<string, unknown>[])?.find(slot => 
          slot.display_time === args.selectedTime
        );

        if (!matchedSlot) {
          return {
            success: false,
            error_code: "SLOT_NOT_RECOGNIZED_OR_EXPIRED",
            message_to_patient: "", // Will be filled by dynamic generation
            details: `Selected time "${args.selectedTime}" not found in available slots`
          };
        }

        // Update conversationState with the matched slot
        conversationState.updateSelectedTimeSlot(matchedSlot);
        selectedTimeDisplay = matchedSlot.display_time as string;
        selectedTimeRaw = matchedSlot.time as string;
      } else if (selectedTimeSlotObject) {
        // Use existing selectedTimeSlot from conversationState
        selectedTimeDisplay = selectedTimeSlotObject.display_time as string;
        selectedTimeRaw = selectedTimeSlotObject.time as string;
      } else {
        return {
          success: false,
          error_code: "INCOMPLETE_BOOKING_CONTEXT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Selected time slot missing from conversation context"
        };
      }

      console.log(`[bookAppointment] Using booking data:`, {
        patientId,
        appointmentTypeId_LaineCUID,
        requestedDate,
        durationMinutes,
        selectedTimeDisplay,
        selectedTimeRaw: selectedTimeRaw ? 'present' : 'missing',
        selectedTimeSlot: conversationState.selectedTimeSlot ? 'present' : 'missing'
      });

      // **SUBPHASE 2: Pre-NexHealth Call User Confirmation Logic**
      // Check if booking details have been presented for confirmation
      const userHasConfirmed = args.userHasConfirmedBooking;
      const detailsPresentedForConfirmation = conversationState.bookingDetailsPresentedForConfirmation;

      // Scenario 1: Details NOT YET Confirmed by User
      if (!userHasConfirmed && !detailsPresentedForConfirmation) {
        // This is the first time book_appointment is called for this specific slot, or confirmation is pending
        // Prepare data for the confirmation message
        
        // Get appointment type details
        const appointmentType = practice.appointmentTypes?.find(
          at => at.id === appointmentTypeId_LaineCUID
        );

        if (!appointmentType) {
          return {
            success: false,
            error_code: "APPOINTMENT_TYPE_NOT_FOUND",
            message_to_patient: "", // Will be filled by dynamic generation
            details: `Appointment type not found for ID: ${appointmentTypeId_LaineCUID}`
          };
        }

        // Get provider info from selectedTimeSlot
        const providerName = (selectedTimeSlotObject?.provider_info as { name?: string })?.name || "your provider";
        
        // Format date for display
        const formattedDate = formatDate(requestedDate);

        // Update conversationState to indicate details have been presented
        conversationState.updateBookingDetailsPresentedForConfirmation(true);

        return {
          success: true,
          message_to_patient: "", // Will be filled by dynamic generation
          data: {
            action_needed: "confirm_booking_details",
            details_for_confirmation: {
              appointmentTypeName: appointmentType.name,
              providerName: providerName,
              dateFriendly: formattedDate, // e.g., "Monday, December 29th"
              timeDisplay: selectedTimeDisplay   // e.g., "7:00 AM"
            }
          }
        };
      }

      // Scenario 2: User HAS Confirmed - proceed to booking
      if (userHasConfirmed === true) {
        // Reset the confirmation flag and proceed to NexHealth API call
        conversationState.updateBookingDetailsPresentedForConfirmation(false);
        // Continue with the booking logic below...
      }

      // Scenario 3: User DECLINED or wants to change something
      if (userHasConfirmed === false || (!userHasConfirmed && detailsPresentedForConfirmation)) {
        // Reset confirmation flag and ask what to change
        conversationState.updateBookingDetailsPresentedForConfirmation(false);
        
        return {
          success: true,
          message_to_patient: "", // Will be filled by dynamic generation
          data: {
            action_needed: "clarify_booking_correction",
            message_suggestion: "Okay, what details would you like to change?"
          }
        };
      }

      // Critical validation that all necessary values from ConversationState are available
      if (!patientId) {
        return {
          success: false,
          error_code: "INCOMPLETE_BOOKING_CONTEXT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Patient ID missing from conversation context"
        };
      }

      if (!appointmentTypeId_LaineCUID) {
        return {
          success: false,
          error_code: "INCOMPLETE_BOOKING_CONTEXT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Appointment type ID missing from conversation context"
        };
      }

      if (!requestedDate) {
        return {
          success: false,
          error_code: "INCOMPLETE_BOOKING_CONTEXT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Requested date missing from conversation context"
        };
      }

      if (!selectedTimeDisplay) {
        return {
          success: false,
          error_code: "INCOMPLETE_BOOKING_CONTEXT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Selected time missing from conversation context"
        };
      }

      // Improved validation: check if selectedTimeSlot is set in ConversationState
      if (!conversationState.selectedTimeSlot) {
        return {
          success: false,
          error_code: "INCOMPLETE_BOOKING_CONTEXT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Selected time slot not confirmed in conversation state"
        };
      }

      // Validate patient ID before proceeding
      if (patientId === 'null' || patientId === 'undefined' || patientId === 'new_patient') {
        return {
          success: false,
          error_code: "INVALID_PATIENT_ID",
          message_to_patient: "", // Will be filled by dynamic generation
          details: `Invalid patient ID provided: ${patientId}`
        };
      }

      // Validate that patient ID is numeric (NexHealth requirement)
      if (isNaN(parseInt(patientId))) {
        return {
          success: false,
          error_code: "INVALID_PATIENT_ID_FORMAT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: `Patient ID must be numeric, received: ${patientId}`
        };
      }

      // Validate selected time format
      const timePattern = /^(1[0-2]|[1-9]):([0-5][0-9])\s?(AM|PM)$/i;
      if (!timePattern.test(selectedTimeDisplay.trim())) {
        return {
         success: false,
         error_code: "INVALID_TIME_FORMAT",
         message_to_patient: "", // Will be filled by dynamic generation
         details: "Invalid time format provided"
       };
     }

     // Get practice configuration
     const activeProviders = practice.savedProviders.filter(sp => sp.isActive);

     if (activeProviders.length === 0) {
       return {
         success: false,
         error_code: "NO_ACTIVE_PROVIDERS",
         message_to_patient: "", // Will be filled by dynamic generation
         details: "No active providers"
       };
     }

     // Resolve NexHealth Appointment Type ID from Laine CUID
     const appointmentType = practice.appointmentTypes?.find(
       at => at.id === appointmentTypeId_LaineCUID
     );

     if (!appointmentType) {
       return {
         success: false,
         error_code: "APPOINTMENT_TYPE_NOT_FOUND",
         message_to_patient: "", // Will be filled by dynamic generation
         details: `Appointment type not found for ID: ${appointmentTypeId_LaineCUID}`
       };
     }

     const nexhealthAppointmentTypeId = appointmentType.nexhealthAppointmentTypeId;

     // IMPROVED LOGIC: Select provider based on accepted appointment types
     const eligibleProviders = activeProviders.filter(sp => {
       // If no accepted types configured, provider accepts all (backward compatibility)
       if (!sp.acceptedAppointmentTypes || sp.acceptedAppointmentTypes.length === 0) {
         return true;
       }
       // Check if provider accepts this appointment type
       return sp.acceptedAppointmentTypes.some(
         relation => relation.appointmentType.id === appointmentType.id
       );
     });

     if (eligibleProviders.length === 0) {
       return {
         success: false,
         error_code: "NO_PROVIDERS_FOR_TYPE",
         message_to_patient: "", // Will be filled by dynamic generation
         data: {
           appointment_type_name: appointmentType.name || 'this appointment type'
         }
       };
     }

     // Select first eligible provider (V1 implementation)
     const selectedProvider = eligibleProviders[0];

     // IMPROVED LOGIC: Select operatory from provider's assigned operatories
     if (!selectedProvider.assignedOperatories || selectedProvider.assignedOperatories.length === 0) {
       return {
         success: false,
         error_code: "NO_ASSIGNED_OPERATORIES",
         message_to_patient: "", // Will be filled by dynamic generation
         details: `Provider ${selectedProvider.provider.firstName} ${selectedProvider.provider.lastName} has no assigned operatories`
       };
     }

     // Select first assigned operatory (V1 implementation)
     const selectedOperatoryAssignment = selectedProvider.assignedOperatories[0];
     const selectedOperatory = selectedOperatoryAssignment.savedOperatory;

     console.log(`[bookAppointment] Selected provider: ${selectedProvider.provider.firstName} ${selectedProvider.provider.lastName} (ID: ${selectedProvider.provider.nexhealthProviderId})`);
     console.log(`[bookAppointment] Selected operatory: ${selectedOperatory.name} (ID: ${selectedOperatory.nexhealthOperatoryId})`);

     // Convert selected time to proper start_time format - use raw time if available, otherwise parse display time
     const timeForParsing = selectedTimeRaw || selectedTimeDisplay;
     const { startTime } = parseSelectedTimeToNexHealthFormat(
       timeForParsing,
       requestedDate,
       'America/Chicago' // Default practice timezone
     );

     // Get appointment type name for notes
     const appointmentTypeNameForNote = appointmentType.name || "Appointment";

     let finalNote = `${appointmentTypeNameForNote} - Scheduled via LAINE AI.`;
     if (callSummaryForNote && callSummaryForNote.trim() !== "" && !callSummaryForNote.toLowerCase().includes("failed") && !callSummaryForNote.toLowerCase().includes("not available")) {
       finalNote = `${callSummaryForNote} (Booked via LAINE AI)`;
     } else if (callSummaryForNote) {
       // If summary generation failed or was unavailable, append that info.
       finalNote = `${appointmentTypeNameForNote} - Scheduled via LAINE AI. (${callSummaryForNote})`;
     }
     
     // Ensure note is not excessively long for EHR systems
     if (finalNote.length > 250) { // Example limit, adjust as needed
       finalNote = finalNote.substring(0, 247) + "...";
     }

     // Prepare booking data with NexHealth IDs
     const bookingData = {
       patient_id: parseInt(patientId),
       provider_id: parseInt(selectedProvider.provider.nexhealthProviderId),
       appointment_type_id: parseInt(nexhealthAppointmentTypeId),
       operatory_id: parseInt(selectedOperatory.nexhealthOperatoryId),
       start_time: startTime,
       note: finalNote
     };

     console.log(`[bookAppointment] Booking data with note:`, JSON.stringify(bookingData, null, 2));

     // **SUBPHASE 3: Make the NexHealth booking API call with graceful error handling**
     let bookingResponse;
     try {
       bookingResponse = await fetchNexhealthAPI(
         '/appointments',
         practice.nexhealthSubdomain,
         bookingData,
         'POST'
       );
     } catch (apiError) {
       console.error('[bookAppointment] NexHealth API error:', apiError);
       
       // Reset confirmation flag and clear booking details on API failure
       conversationState.updateBookingDetailsPresentedForConfirmation(false);
       conversationState.updateBookedAppointmentDetails(null);
       
       // Handle specific NexHealth API errors
       if (apiError instanceof Error) {
         if (apiError.message.includes("409") || apiError.message.includes("conflict")) {
           return {
             success: false,
             error_code: "SLOT_UNAVAILABLE",
             message_to_patient: "", // Will be filled by dynamic generation
             details: "The selected time slot is no longer available"
           };
         } else if (apiError.message.includes("400")) {
           return {
             success: false,
             error_code: "VALIDATION_ERROR",
             message_to_patient: "", // Will be filled by dynamic generation
             details: apiError.message
           };
         }
       }
       
       return {
         success: false,
         error_code: "NEXHEALTH_API_ERROR",
         message_to_patient: "", // Will be filled by dynamic generation
         details: apiError instanceof Error ? apiError.message : "NexHealth API error"
       };
     }

     if (!bookingResponse?.id && !bookingResponse?.data?.id) {
       console.error('[bookAppointment] Booking failed: Invalid response format');
       
       // Reset confirmation flag and clear booking details on invalid response
       conversationState.updateBookingDetailsPresentedForConfirmation(false);
       conversationState.updateBookedAppointmentDetails(null);
       
       return {
         success: false,
         error_code: "BOOKING_FAILED",
         message_to_patient: "", // Will be filled by dynamic generation
         details: "Invalid booking response format"
       };
     }

     // Extract appointment ID from response
     const appointmentId = bookingResponse.data?.id || bookingResponse.id;
     
     // **SUBPHASE 4: Update ConversationState with booking outcome**
     conversationState.updateBookedAppointmentDetails({
       nexhealthAppointmentId: String(appointmentId),
       patientId: patientId,
       appointmentTypeName: appointmentType.name,
       date: requestedDate,
       time: selectedTimeDisplay,
       providerName: selectedProvider.provider.firstName ? 
         `${selectedProvider.provider.firstName} ${selectedProvider.provider.lastName || ''}`.trim() : 
         selectedProvider.provider.lastName || 'your provider'
     });

     // Update call log with booking information
     if (appointmentId) {
       await updateCallLogWithBooking(vapiCallId, String(appointmentId), requestedDate, selectedTimeDisplay);
     }

     // Format appointment details for confirmation
     const formattedDate = formatDate(requestedDate);
     const providerName = selectedProvider.provider.firstName ? 
       `${selectedProvider.provider.firstName} ${selectedProvider.provider.lastName || ''}`.trim() : 
       selectedProvider.provider.lastName || 'your provider';
     const appointmentTypeDisplayName = appointmentType.name || "your appointment";

            return {
         success: true,
         message_to_patient: "", // Will be filled by dynamic generation
         data: {
           appointment_id: String(appointmentId),
           patient_id: patientId,
           appointment_type: appointmentTypeDisplayName,
           appointment_type_name: appointmentTypeDisplayName, // Alternative key for consistency
           date: requestedDate,
           date_friendly: formattedDate,
           time: selectedTimeDisplay,
           provider_name: providerName,
           practice_name: practice.name,
           operatory_name: selectedOperatory.name,
           note_summary: finalNote,
           booked: true
         }
       };

    } catch (error) {
      console.error(`[bookAppointment] Error:`, error);
      
      // **SUBPHASE 3 & 4: Graceful error handling and ConversationState update**
      // Reset confirmation flag on failure
      conversationState.updateBookingDetailsPresentedForConfirmation(false);
      
      // Clear booked appointment details on failure
      conversationState.updateBookedAppointmentDetails(null);
      
      let errorCode = "BOOKING_ERROR";
      
      if (error instanceof Error) {
        if (error.message.includes("400") || error.message.includes("validation")) {
          errorCode = "VALIDATION_ERROR";
        } else if (error.message.includes("409") || error.message.includes("conflict")) {
          errorCode = "SLOT_UNAVAILABLE";
        } else if (error.message.includes("401")) {
          errorCode = "AUTH_ERROR";
        }
      }
      
      return {
        success: false,
        error_code: errorCode,
        message_to_patient: "", // Will be filled by dynamic generation
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
};

/**
* Convert patient's selected time to NexHealth API format with proper timezone handling
*/
function parseSelectedTimeToNexHealthFormat(
 selectedTime: string,
 requestedDate: string,
 practiceTimezone: string = 'America/Chicago'
): { startTime: string } {
 // Parse the selected time and date in the practice's timezone
 const localDateTime = DateTime.fromFormat(
   `${requestedDate} ${selectedTime}`,
   'yyyy-MM-dd h:mm a',
   { zone: practiceTimezone }
 );

 if (!localDateTime.isValid) {
   throw new Error(`Invalid date/time format: ${requestedDate} ${selectedTime}. Error: ${localDateTime.invalidReason}`);
 }

 // Convert to UTC and format for NexHealth API
 const startTime = localDateTime.toUTC().toISO({ suppressMilliseconds: true });

 if (!startTime) {
   throw new Error(`Failed to convert to UTC: ${requestedDate} ${selectedTime}`);
 }

 console.log(`[timezone] Converting ${selectedTime} on ${requestedDate} in ${practiceTimezone} to UTC: ${startTime}`);

 return { startTime };
}

/**
* Format date for patient-friendly display
*/
function formatDate(dateString: string): string {
 try {
   const date = new Date(dateString + 'T00:00:00');
   return date.toLocaleDateString('en-US', {
     weekday: 'long',
     month: 'long',
     day: 'numeric'
   });
 } catch {
   return dateString;
 }
}

/**
* Update call log with booking information
*/
async function updateCallLogWithBooking(
 vapiCallId: string,
 appointmentId: string,
 appointmentDate: string,
 appointmentTime: string
) {
 try {
   const { prisma } = await import("@/lib/prisma");
   await prisma.callLog.update({
     where: { vapiCallId },
     data: {
       callStatus: "APPOINTMENT_BOOKED",
       bookedAppointmentNexhealthId: appointmentId,
       summary: `Appointment booked for ${appointmentDate} at ${appointmentTime}`,
       updatedAt: new Date()
     }
   });
 } catch (error) {
   console.error("[bookAppointment] Error updating call log:", error);
 }
}

export default bookAppointmentTool; 