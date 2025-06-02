import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import { DateTime } from "luxon";

export const bookAppointmentSchema = z.object({
  selectedTime: z.string()
    .min(1)
    .describe("The specific time the patient selected from the available options (e.g., '8:00 AM', '2:30 PM'). This should match one of the display times from the previous availability check."),
  patientId: z.string()
    .min(1)
    .describe("The patient ID from the find_patient_in_ehr tool call"),
  appointmentTypeId: z.string()
    .min(1)
    .describe("The appointment type ID from the find_appointment_type tool call"),
  requestedDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .describe("The requested appointment date in YYYY-MM-DD format"),
  durationMinutes: z.number()
    .min(1)
    .describe("The duration of the appointment in minutes from the appointment type")
});

const bookAppointmentTool: ToolDefinition<typeof bookAppointmentSchema> = {
  name: "book_appointment",
  description: "Books the actual appointment after the patient has selected a specific time. Use this after showing available slots and getting the patient's time preference.",
  schema: bookAppointmentSchema,
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice, vapiCallId } = context;
    
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
        message_to_patient: "The practice hasn't configured any providers for online scheduling. Please contact the office directly."
      };
    }

    try {
      console.log(`[bookAppointment] Booking appointment for patient ${args.patientId} on ${args.requestedDate} at ${args.selectedTime}`);

      // Validate selected time format
      if (!validateSelectedTime(args.selectedTime)) {
        return {
          success: false,
          error_code: "INVALID_TIME_FORMAT",
          message_to_patient: `The time "${args.selectedTime}" is not in a valid format. Please choose a time like "8:00 AM" or "2:30 PM".`
        };
      }

      // Get practice configuration
      const activeProviders = practice.savedProviders.filter(sp => sp.isActive);
      const activeOperatories = practice.savedOperatories?.filter(so => so.isActive) || [];

      if (activeProviders.length === 0) {
        return {
          success: false,
          error_code: "NO_ACTIVE_PROVIDERS",
          message_to_patient: "No providers are currently available for booking. Please contact the office."
        };
      }

      if (activeOperatories.length === 0) {
        return {
          success: false,
          error_code: "NO_ACTIVE_OPERATORIES",
          message_to_patient: "No operatories are configured for booking. Please contact the office."
        };
      }

      // Get the first active provider and operatory
      const provider = activeProviders[0];
      const operatory = activeOperatories[0];

      // Convert selected time to proper start_time format
      const { startTime } = parseSelectedTimeToNexHealthFormat(
        args.selectedTime,
        args.requestedDate,
        'America/Chicago' // Default practice timezone - TODO: add to practice model
      );

      // Get appointment type name for notes
      const appointmentType = practice.appointmentTypes?.find(
        at => at.nexhealthAppointmentTypeId === args.appointmentTypeId
      );

      // Prepare booking data (matching working curl structure)
      const bookingData = {
        patient_id: parseInt(args.patientId),
        provider_id: parseInt(provider.provider.nexhealthProviderId),
        appointment_type_id: parseInt(args.appointmentTypeId),
        operatory_id: parseInt(operatory.nexhealthOperatoryId),
        start_time: startTime,
        // Note: Removed end_time and location_id as they should be in URL params
        note: appointmentType ? `${appointmentType.name} - Scheduled via LAINE AI Assistant` : "Scheduled via LAINE AI Assistant"
      };

      console.log(`[bookAppointment] Booking data:`, JSON.stringify(bookingData, null, 2));

      // Make the booking API call with correct URL parameters and body structure
      const bookingResponse = await fetchNexhealthAPI(
        '/appointments',
        practice.nexhealthSubdomain,
        {
          location_id: practice.nexhealthLocationId,
          notify_patient: 'false'
        },
        'POST',
        { appt: bookingData }  // Changed from 'appointment' to 'appt'
      );

      console.log(`[bookAppointment] Booking response:`, JSON.stringify(bookingResponse, null, 2));

      // Check if booking was successful
      if (!bookingResponse || bookingResponse.error || !bookingResponse.data) {
        console.error(`[bookAppointment] Booking failed:`, bookingResponse);
        return {
          success: false,
          error_code: "BOOKING_FAILED",
          message_to_patient: "I'm sorry, I wasn't able to book your appointment. Please contact the office to schedule.",
          details: bookingResponse?.error || "Unknown booking error"
        };
      }

      // Update call log with booking information
      await updateCallLogWithBooking(vapiCallId, bookingResponse.data.id, args.requestedDate, startTime);

      // Format confirmation message
      const appointmentTypeName = appointmentType?.name || "appointment";
      const formattedDate = formatDate(args.requestedDate);
      const formattedTime = args.selectedTime;

      return {
        success: true,
        message_to_patient: `Perfect! I've successfully booked your ${appointmentTypeName} for ${formattedDate} at ${formattedTime}. You should receive a confirmation shortly. Is there anything else I can help you with?`,
        data: {
          appointment_id: bookingResponse.data.id,
          confirmation_number: bookingResponse.data.id,
          appointment_date: args.requestedDate,
          appointment_time: args.selectedTime,
          appointment_type: appointmentTypeName,
          provider_name: provider.provider.firstName + " " + provider.provider.lastName || "Dr. " + provider.provider.lastName,
          location_name: practice.name,
          booking_source: "laine_ai"
        }
      };

    } catch (error) {
      console.error(`[bookAppointment] Error:`, error);
      
      let message = "I'm having trouble booking your appointment right now. Please contact the office to schedule.";
      if (error instanceof Error) {
        if (error.message.includes("401")) {
          message = "There's an authentication issue with the booking system. Please contact the office.";
        } else if (error.message.includes("conflict") || error.message.includes("409")) {
          message = "That time slot is no longer available. Would you like me to check for other available times?";
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
    start: "Let me book that appointment for you...",
    success: "Perfect! Your appointment has been confirmed.",
    fail: "I'm having trouble booking your appointment right now."
  }
};

/**
 * Validate that the selected time is in the correct format
 */
function validateSelectedTime(selectedTime: string): boolean {
  // Check if the time matches expected format (e.g., "8:00 AM", "12:30 PM")
  const timePattern = /^(1[0-2]|[1-9]):([0-5][0-9])\s?(AM|PM)$/i;
  return timePattern.test(selectedTime.trim());
}

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
      year: 'numeric',
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