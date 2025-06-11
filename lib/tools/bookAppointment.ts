import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import { DateTime } from "luxon";

export const bookAppointmentSchema = z.object({
  selectedTime: z.string()
    .min(1)
    .describe(`Extract time patient selected from available options.

Examples: "I'll take 8 AM" → "8:00 AM", "The 2:30 slot" → "2:30 PM", "10 o'clock" → "10:00 AM"

Rules: Include :00/:30 for minutes, include AM/PM, match format presented to patient`),
  patientId: z.string()
    .min(1)
    .describe(`CRITICAL: This MUST be the numeric patient ID (e.g., "381872342") obtained from the successful result of a PREVIOUS 'find_patient_in_ehr' or 'create_new_patient' tool call. 
DO NOT use the patient's name (e.g., "Alex Dan"). 
DO NOT invent an ID. 
If a new patient was just created, use the 'patient_id' provided in the data output of the 'create_new_patient' tool. 
If an existing patient was found, use the 'patient_id' from the 'find_patient_in_ehr' tool.
This ID is essential for linking the appointment to the correct patient record in the EHR.`),
  appointmentTypeId: z.string()
    .min(1)
    .describe("The appointment type ID (e.g., '1014017') from the data.appointment_type_id field of a successful 'find_appointment_type' tool call"),
  requestedDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .describe("The requested appointment date in YYYY-MM-DD format, typically confirmed after a 'check_available_slots' tool call or directly from user input if a specific date was requested and validated"),
  durationMinutes: z.number()
    .min(1)
    .describe("The duration of the appointment in minutes (e.g., 90) from the data.duration_minutes field of a successful 'find_appointment_type' tool call")
});

const bookAppointmentTool: ToolDefinition<typeof bookAppointmentSchema> = {
  name: "book_appointment",
  description: "Books the actual appointment after the patient has selected a specific time. Use this after showing available slots and getting the patient's time preference.",
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
     await updateCallLogWithBooking(vapiCallId, bookingResponse.data.id, args.requestedDate, startTime);

     // Format confirmation message
     const appointmentTypeName = appointmentType?.name || "appointment";
     const formattedDate = formatDate(args.requestedDate);
     const formattedTime = args.selectedTime;
     const providerName = provider.provider.firstName 
       ? `${provider.provider.firstName} ${provider.provider.lastName}`
       : `Dr. ${provider.provider.lastName}`;

     return {
       success: true,
       message_to_patient: `Excellent! I've successfully booked your ${appointmentTypeName} for ${formattedDate} at ${formattedTime} with ${providerName}. You'll receive a confirmation text shortly. Is there anything else I can help you with today?`,
       data: {
         appointment_id: bookingResponse.data.id,
         confirmation_number: bookingResponse.data.id,
         appointment_date: args.requestedDate,
         appointment_time: args.selectedTime,
         appointment_type: appointmentTypeName,
         provider_name: providerName,
         location_name: practice.name,
         booking_source: "laine_ai",
         note_sent_to_ehr: finalNote // Add this for logging/verification
       }
     };

   } catch (error) {
     console.error(`[bookAppointment] Error:`, error);
     
     let message = "I'm having trouble completing your booking right now. Please contact the office directly to schedule your appointment.";
     if (error instanceof Error) {
       if (error.message.includes("401")) {
         message = "There's an authentication issue with the booking system. Please contact the office for assistance.";
       } else if (error.message.includes("conflict") || error.message.includes("409")) {
         message = "It looks like that time slot just became unavailable. Would you like me to show you other available times?";
       }
     }
     
     return {
       success: false,
       error_code: "BOOKING_ERROR",
       message_to_patient: message,
       details: error instanceof Error ? error.message : "Unknown error"
     };
   }
 },

 messages: {
   start: "Perfect! Let me book that appointment for you...",
   success: "Excellent! Your appointment has been confirmed.",
   fail: "I'm having trouble booking that time. Let me see what else is available."
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