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
        message_to_patient: "I can't complete the booking right now. Please contact the office directly to finalize your appointment."
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

     if (activeOperatories.length === 0) {
       return {
         success: false,
         error_code: "NO_ACTIVE_OPERATORIES",
         message_to_patient: "I need to assign a room but none are available. Please contact the office to complete your booking."
       };
     }

     // Get the first active provider and operatory
     const provider = activeProviders[0];
     const operatory = activeOperatories[0];

     // Convert selected time to proper start_time format
     const { startTime } = parseSelectedTimeToNexHealthFormat(
       args.selectedTime,
       args.requestedDate,
       'America/Chicago' // Default practice timezone
     );

     // Get appointment type name for notes
     const appointmentType = practice.appointmentTypes?.find(
       at => at.nexhealthAppointmentTypeId === args.appointmentTypeId
     );
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
       provider_id: parseInt(provider.provider.nexhealthProviderId),
       appointment_type_id: parseInt(args.appointmentTypeId),
       operatory_id: parseInt(operatory.nexhealthOperatoryId),
       start_time: startTime,
       note: finalNote // USE THE FINAL NOTE
     };

     console.log(`[bookAppointment] Booking data with note:`, JSON.stringify(bookingData, null, 2));

     // Make the booking API call
     const bookingResponse = await fetchNexhealthAPI(
       '/appointments',
       practice.nexhealthSubdomain,
       {
         location_id: practice.nexhealthLocationId,
         notify_patient: 'false'
       },
       'POST',
       { appt: bookingData }
     );

     console.log(`[bookAppointment] Booking response:`, JSON.stringify(bookingResponse, null, 2));

     // Check if booking was successful
     if (!bookingResponse || bookingResponse.error || !bookingResponse.data) {
       console.error(`[bookAppointment] Booking failed:`, bookingResponse);
       
       // Enhanced error handling for specific booking failures
       let errorMessage = "I wasn't able to complete your booking. Please contact the office directly to schedule your appointment.";
       let errorCode = "BOOKING_FAILED";
       
       if (bookingResponse?.error) {
         const errorString = typeof bookingResponse.error === 'string' ? bookingResponse.error : JSON.stringify(bookingResponse.error);
         
         if (errorString.includes('patient') && errorString.includes('not found')) {
           errorCode = "PATIENT_NOT_FOUND";
           errorMessage = "I couldn't find your patient record in our system. Let me help you create a patient record first.";
         } else if (errorString.includes('appointment_type')) {
           errorCode = "INVALID_APPOINTMENT_TYPE";
           errorMessage = "There's an issue with the appointment type. Let me help you select a different type of appointment.";
         } else if (errorString.includes('provider')) {
           errorCode = "PROVIDER_UNAVAILABLE";
           errorMessage = "The provider is no longer available for this time. Let me show you other available times.";
         } else if (errorString.includes('operatory')) {
           errorCode = "ROOM_UNAVAILABLE";
           errorMessage = "The treatment room is no longer available. Let me check for other available times.";
         }
       }
       
       return {
         success: false,
         error_code: errorCode,
         message_to_patient: errorMessage,
         details: bookingResponse?.error || "Unknown booking error"
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
     const providerName = provider.provider.firstName ? 
       `${provider.provider.firstName} ${provider.provider.lastName || ''}`.trim() : 
       provider.provider.lastName || 'your provider';
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