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
    .describe(`CRITICAL: Numeric patient ID (e.g., "381872342") from previous find_patient_in_ehr or create_new_patient tool call. NOT patient name. Required for EHR linking.`),
  appointmentTypeId: z.string()
    .min(1)
    .describe("Appointment type ID from successful find_appointment_type tool call data.appointment_type_id field"),
  requestedDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .describe("Appointment date in YYYY-MM-DD format from check_available_slots or user input"),
  durationMinutes: z.number()
    .min(1)
    .describe("Appointment duration in minutes from find_appointment_type tool call data.duration_minutes field")
});

const bookAppointmentTool: ToolDefinition<typeof bookAppointmentSchema> = {
  name: "book_appointment",
  description: "Books the actual appointment after patient selects a specific time from available slots. Use after showing available slots and getting patient's time preference.",
  schema: bookAppointmentSchema,
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice, vapiCallId, callSummaryForNote } = context;
    
    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return {
        success: false,
        error_code: "PRACTICE_CONFIG_MISSING",
        message_to_patient: "I can't book appointments right now. Please contact the office directly."
      };
    }

    if (!practice.savedProviders || practice.savedProviders.length === 0) {
      return {
        success: false,
        error_code: "NO_SAVED_PROVIDERS",
        message_to_patient: "I need to assign a provider but none are configured. Please contact the office to complete your booking."
      };
    }

    try {
      console.log(`[bookAppointment] Booking appointment for patient ${args.patientId} on ${args.requestedDate} at ${args.selectedTime}`);

      // Validate patient ID before proceeding
      if (!args.patientId || args.patientId === 'null' || args.patientId === 'undefined' || args.patientId === 'new_patient') {
        return {
          success: false,
          error_code: "INVALID_PATIENT_ID",
          message_to_patient: "I need to verify your patient information before booking. Let me help you with that first.",
          details: `Invalid patient ID provided: ${args.patientId}`
        };
      }

      // Validate that patient ID is numeric (NexHealth requirement)
      if (isNaN(parseInt(args.patientId))) {
        return {
          success: false,
          error_code: "INVALID_PATIENT_ID_FORMAT",
          message_to_patient: "There's an issue with your patient record. Please contact the office to complete your booking.",
          details: `Patient ID must be numeric, received: ${args.patientId}`
        };
      }

      // Validate selected time format
      const timePattern = /^(1[0-2]|[1-9]):([0-5][0-9])\s?(AM|PM)$/i;
      if (!timePattern.test(args.selectedTime.trim())) {
      return {
         success: false,
         error_code: "INVALID_TIME_FORMAT",
         message_to_patient: `I didn't quite catch that time. Could you please choose from the available times I mentioned?`
       };
     }

     // Get practice configuration
     const activeProviders = practice.savedProviders.filter(sp => sp.isActive);
     const activeOperatories = practice.savedOperatories?.filter(so => so.isActive) || [];

     if (activeProviders.length === 0) {
       return {
         success: false,
         error_code: "NO_ACTIVE_PROVIDERS",
         message_to_patient: "I need to assign a provider but none are available. Please contact the office to complete your booking."
       };
     }

     // Find the appointment type to help with provider selection
     const appointmentType = practice.appointmentTypes?.find(
       at => at.nexhealthAppointmentTypeId === args.appointmentTypeId
     );

     // IMPROVED LOGIC: Select provider based on accepted appointment types
     let selectedProvider = activeProviders[0]; // Fallback to first
     
     if (appointmentType) {
       // Try to find a provider that accepts this appointment type
       const providersForType = activeProviders.filter(sp => {
         // If no accepted types configured, provider accepts all (backward compatibility)
         if (!sp.acceptedAppointmentTypes || sp.acceptedAppointmentTypes.length === 0) {
           return true;
         }
         // Check if provider accepts this appointment type
         return sp.acceptedAppointmentTypes.some(
           relation => relation.appointmentType.id === appointmentType.id
         );
       });

       if (providersForType.length > 0) {
         selectedProvider = providersForType[0];
       }
     }

     // IMPROVED LOGIC: Select operatory based on provider's default or first available
     let selectedOperatory = activeOperatories[0]; // Fallback

     if (selectedProvider.defaultOperatoryId) {
       const defaultOperatory = activeOperatories.find(
         op => op.id === selectedProvider.defaultOperatoryId
       );
       if (defaultOperatory) {
         selectedOperatory = defaultOperatory;
       }
     }

     if (!selectedOperatory) {
       return {
         success: false,
         error_code: "NO_ACTIVE_OPERATORIES",
         message_to_patient: "I need to assign a room but none are available. Please contact the office to complete your booking."
       };
     }

     // Convert selected time to proper start_time format
     const { startTime } = parseSelectedTimeToNexHealthFormat(
       args.selectedTime,
       args.requestedDate,
       'America/Chicago' // Default practice timezone
     );

     // Get appointment type name for notes
     const appointmentTypeNameForNote = appointmentType?.name || "Appointment";

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

     // Prepare booking data
     const bookingData = {
       patient_id: parseInt(args.patientId),
       provider_id: parseInt(selectedProvider.provider.nexhealthProviderId),
       appointment_type_id: parseInt(args.appointmentTypeId),
       operatory_id: parseInt(selectedOperatory.nexhealthOperatoryId),
       start_time: startTime,
       note: finalNote
     };

     console.log(`[bookAppointment] Booking data with note:`, JSON.stringify(bookingData, null, 2));

     // Make the booking API call
     const bookingResponse = await fetchNexhealthAPI(
       '/appointments',
       practice.nexhealthSubdomain,
       bookingData,
       'POST'
     );

     if (!bookingResponse?.id) {
       console.error('[bookAppointment] Booking failed: Invalid response format');
       return {
         success: false,
         error_code: "BOOKING_FAILED",
         message_to_patient: "I'm having trouble booking your appointment. Please contact the office to complete your booking."
       };
     }

     // Update call log with booking information
     const appointmentId = bookingResponse.data?.id || bookingResponse.data?.appointment?.id;
     if (appointmentId) {
       await updateCallLogWithBooking(vapiCallId, String(appointmentId), args.requestedDate, args.selectedTime);
     }

     // Format appointment details for confirmation
     const formattedDate = formatDate(args.requestedDate);
     const formattedTime = args.selectedTime;
     const providerName = selectedProvider.provider.firstName ? 
       `${selectedProvider.provider.firstName} ${selectedProvider.provider.lastName || ''}`.trim() : 
       selectedProvider.provider.lastName || 'your provider';
     const appointmentTypeName = appointmentType?.name || "your appointment";

     return {
       success: true,
       message_to_patient: `Excellent! I've successfully booked your ${appointmentTypeName} for ${formattedDate} at ${formattedTime} with ${providerName}. You should receive a confirmation shortly. Is there anything else I can help you with today?`,
       data: {
         appointment_id: String(appointmentId),
         patient_id: args.patientId,
         appointment_type: appointmentTypeName,
         date: args.requestedDate,
         time: args.selectedTime,
         provider_name: providerName,
         booked: true
       }
     };

    } catch (error) {
      console.error(`[bookAppointment] Error:`, error);
      
      return {
        success: false,
        error_code: "BOOKING_ERROR",
        message_to_patient: "I'm having trouble completing your booking right now. Please contact the office directly to schedule your appointment.",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me book that appointment for you...",
    success: "Okay, booking processed.",
    fail: "There was an issue with the booking."
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