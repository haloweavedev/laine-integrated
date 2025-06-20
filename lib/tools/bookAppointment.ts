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
  description: `
    Books the appointment in the EHR system once all details are confirmed.
    CRITICAL: Only call this tool as the FINAL step in the booking process.
    WHEN TO USE: Call this tool AFTER:
    1. Patient identity is confirmed (via 'find_patient_in_ehr' or 'create_new_patient', providing a 'patientId').
    2. Appointment type is determined (via 'find_appointment_type', providing an 'appointmentTypeId' and 'durationMinutes').
    3. Available slots were checked (via 'check_available_slots') and the patient has explicitly selected a 'selectedTime' from those options for a specific 'requestedDate'.
    REQUIRED INPUTS: 'selectedTime' (e.g., "8:00 AM"), 'patientId', 'appointmentTypeId', 'requestedDate' (YYYY-MM-DD), 'durationMinutes'.
    OUTPUTS: On success, confirms the booking and returns 'appointment_id', 'booked_date', 'booked_time', etc.
    DO NOT CALL if any of the required inputs are missing or if the preceding steps have not been completed.
  `.trim(),
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
    const { practice, vapiCallId, callSummaryForNote } = context;
    
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
      console.log(`[bookAppointment] Booking appointment for patient ${args.patientId} on ${args.requestedDate} at ${args.selectedTime}`);

      // Validate patient ID before proceeding
      if (!args.patientId || args.patientId === 'null' || args.patientId === 'undefined' || args.patientId === 'new_patient') {
        return {
          success: false,
          error_code: "INVALID_PATIENT_ID",
          message_to_patient: "", // Will be filled by dynamic generation
          details: `Invalid patient ID provided: ${args.patientId}`
        };
      }

      // Validate that patient ID is numeric (NexHealth requirement)
      if (isNaN(parseInt(args.patientId))) {
        return {
          success: false,
          error_code: "INVALID_PATIENT_ID_FORMAT",
          message_to_patient: "", // Will be filled by dynamic generation
          details: `Patient ID must be numeric, received: ${args.patientId}`
        };
      }

      // Validate selected time format
      const timePattern = /^(1[0-2]|[1-9]):([0-5][0-9])\s?(AM|PM)$/i;
      if (!timePattern.test(args.selectedTime.trim())) {
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

     // Find the appointment type to help with provider selection
     const appointmentType = practice.appointmentTypes?.find(
       at => at.nexhealthAppointmentTypeId === args.appointmentTypeId
     );

     // IMPROVED LOGIC: Select provider based on accepted appointment types
     const eligibleProviders = activeProviders.filter(sp => {
       // If no accepted types configured, provider accepts all (backward compatibility)
       if (!sp.acceptedAppointmentTypes || sp.acceptedAppointmentTypes.length === 0) {
         return true;
       }
       // Check if provider accepts this appointment type
       return sp.acceptedAppointmentTypes.some(
         relation => relation.appointmentType.id === appointmentType?.id
       );
     });

     if (eligibleProviders.length === 0) {
       return {
         success: false,
         error_code: "NO_PROVIDERS_FOR_TYPE",
         message_to_patient: "", // Will be filled by dynamic generation
         data: {
           appointment_type_name: appointmentType?.name || 'this appointment type'
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
         message_to_patient: "", // Will be filled by dynamic generation
         details: "Invalid booking response format"
       };
     }

     // Update call log with booking information
     const appointmentId = bookingResponse.data?.id || bookingResponse.data?.appointment?.id;
     if (appointmentId) {
       await updateCallLogWithBooking(vapiCallId, String(appointmentId), args.requestedDate, args.selectedTime);
     }

     // Format appointment details for confirmation
     const formattedDate = formatDate(args.requestedDate);
     const providerName = selectedProvider.provider.firstName ? 
       `${selectedProvider.provider.firstName} ${selectedProvider.provider.lastName || ''}`.trim() : 
       selectedProvider.provider.lastName || 'your provider';
     const appointmentTypeName = appointmentType?.name || "your appointment";

     return {
       success: true,
       message_to_patient: "", // Will be filled by dynamic generation
       data: {
         appointment_id: String(appointmentId),
         patient_id: args.patientId,
         appointment_type: appointmentTypeName,
         appointment_type_name: appointmentTypeName, // Alternative key for consistency
         date: args.requestedDate,
         date_friendly: formattedDate,
         time: args.selectedTime,
         provider_name: providerName,
         practice_name: practice.name,
         booked: true,
         booking_successful: true
       }
     };

    } catch (error) {
      console.error(`[bookAppointment] Error:`, error);
      
      return {
        success: false,
        error_code: "BOOKING_ERROR",
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