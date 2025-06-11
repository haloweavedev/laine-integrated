import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";

// Generate current date dynamically for LLM context
function getCurrentDate(): string {
  const today = new Date();
  return today.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

export const checkAvailableSlotsSchema = z.object({
  requestedDate: z.string()
    .min(1)
    .refine((date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false;
      }
      // Validate it's a real date
      const parsedDate = new Date(date);
      return !isNaN(parsedDate.getTime()) && date === parsedDate.toISOString().split('T')[0];
    }, "Date must be in YYYY-MM-DD format and be a valid date")
    .describe(`Convert patient's date request to YYYY-MM-DD format.

Current date: ${getCurrentDate()}

Examples:
- "December 23rd" → "2025-12-23"
- "next Friday" → calculate next Friday from ${getCurrentDate()}
- "tomorrow" → calculate tomorrow from ${getCurrentDate()}

Rules:
1. Return YYYY-MM-DD format
2. If no year specified, use next occurrence
3. For relative dates, calculate from ${getCurrentDate()}
4. If ambiguous, ask for clarification`),
  appointmentTypeId: z.string().min(1).describe("The appointment type ID from the previous tool call"),
  days: z.number().min(1).max(7).default(1).describe("Number of days to check (default 1)")
});

const checkAvailableSlotsTool: ToolDefinition<typeof checkAvailableSlotsSchema> = {
  name: "check_available_slots",
  description: "Checks available appointment slots for a specific date and appointment type. Use this after confirming patient identity and appointment type to show available times.",
  schema: checkAvailableSlotsSchema,
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice } = context;
    
    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return {
        success: false,
        error_code: "PRACTICE_CONFIG_MISSING",
        message_to_patient: "I can't check availability right now. Please contact the office directly."
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
      // Get provider and operatory IDs from practice preferences
      const activeProviders = practice.savedProviders.filter(sp => sp.isActive);
      const activeOperatories = practice.savedOperatories?.filter(so => so.isActive) || [];

      if (activeProviders.length === 0) {
        return {
          success: false,
          error_code: "NO_ACTIVE_PROVIDERS",
          message_to_patient: "No providers are currently available for online scheduling. Please contact the office."
        };
      }

      console.log(`[checkAvailableSlots] Checking ${args.requestedDate} for appointment type ${args.appointmentTypeId}`);

      // Get provider and operatory arrays
      const providers = activeProviders.map(sp => sp.provider.nexhealthProviderId);
      const operatories = activeOperatories.map(so => so.nexhealthOperatoryId);

      // Build search params object for NexHealth API
      const searchParams: Record<string, string | string[]> = {
        subdomain: practice.nexhealthSubdomain,
        start_date: args.requestedDate,
        days: args.days.toString(),
        appointment_type_id: args.appointmentTypeId,
        'lids[]': [practice.nexhealthLocationId],
        'pids[]': providers
      };

      // Add operatory IDs if configured
      if (operatories.length > 0) {
        searchParams['operatory_ids[]'] = operatories;
      }

      const slotsResponse = await fetchNexhealthAPI(
        '/appointment_slots',
        practice.nexhealthSubdomain,
        searchParams
      );

      console.log(`[checkAvailableSlots] API response:`, JSON.stringify(slotsResponse, null, 2));

      // Parse response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const availableSlots: any[] = [];
      
      if (slotsResponse?.data && Array.isArray(slotsResponse.data)) {
        // Extract all slots from all providers
        for (const providerData of slotsResponse.data) {
          if (providerData.slots && Array.isArray(providerData.slots)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            availableSlots.push(...providerData.slots.map((slot: any) => ({
              ...slot,
              provider_id: providerData.pid,
              location_id: providerData.lid
            })));
          }
        }
      }

      if (availableSlots.length === 0) {
        // No slots found - let's provide more helpful information
        console.log(`[checkAvailableSlots] No slots found for appointment type ${args.appointmentTypeId} on ${args.requestedDate}`);
        
        // Create a more conversational and proactive message for no slots found
        const appointmentTypeName = practice.appointmentTypes?.find(at => at.nexhealthAppointmentTypeId === args.appointmentTypeId)?.name || "that appointment type";
        const friendlyDate = formatDate(args.requestedDate);
        
        let messageToPatient = `I'm sorry, I don't see any available slots for a ${appointmentTypeName} on ${friendlyDate}.`;

        const otherAppointmentTypesExist = (practice.appointmentTypes?.length || 0) > 1;

        if (otherAppointmentTypesExist) {
          messageToPatient += ` Would you like me to check for a different type of appointment on that day, or perhaps look for ${appointmentTypeName} on another date?`;
        } else {
          messageToPatient += ` Would you like me to check for ${appointmentTypeName} on a different date?`;
        }

        return {
          success: true,
          message_to_patient: messageToPatient,
          data: {
            requested_date: args.requestedDate,
            requested_appointment_type_id: args.appointmentTypeId,
            appointment_type_name: appointmentTypeName, // Add for context
            available_slots: [],
            has_availability: false,
            debug_info: {
              providers_checked: providers.length,
              operatories_checked: operatories.length,
              appointment_type_name: appointmentTypeName
            }
          }
        };
      }

      // Format slots for patient-friendly display
      const formattedSlots = availableSlots.slice(0, 8).map((slot, index) => {
        // Parse the time string correctly to preserve the timezone
        const startTime = new Date(slot.time);
        
        // Use the timezone from the original date string for formatting
        const timeString = startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/Chicago' // Explicitly use Central Time to match NexHealth
        });
        
        return {
          slot_id: `slot_${index}`,
          time: slot.time,
          end_time: slot.end_time,
          display_time: timeString,
          operatory_id: slot.operatory_id,
          provider_id: slot.provider_id,
          location_id: slot.location_id
        };
      });

      // Create more conversational message with appointment type and limited initial options
      const appointmentTypeName = practice.appointmentTypes?.find(at => at.nexhealthAppointmentTypeId === args.appointmentTypeId)?.name || "your appointment";
      const friendlyDate = formatDate(args.requestedDate);

      // Offer a limited number of slots initially for voice, e.g., 3 or 4
      const slotsToOfferCount = Math.min(formattedSlots.length, 3); // Offer up to 3 slots
      const offeredTimeList = formattedSlots.slice(0, slotsToOfferCount).map(slot => slot.display_time);
      
      let timeOptionsMessage = "";
      if (offeredTimeList.length === 1) {
        timeOptionsMessage = offeredTimeList[0];
      } else if (offeredTimeList.length > 1) {
        timeOptionsMessage = offeredTimeList.slice(0, -1).join(', ') + (offeredTimeList.length > 1 ? ', or ' : '') + offeredTimeList[offeredTimeList.length - 1];
      }

      let finalMessageToPatient = `Okay! For a ${appointmentTypeName} on ${friendlyDate}, I have ${timeOptionsMessage} available.`;

      if (formattedSlots.length > slotsToOfferCount) {
        finalMessageToPatient += ` I also have a few other times that day. Do any of those I mentioned work, or would you like to hear more options for ${friendlyDate}?`;
      } else if (formattedSlots.length > 0) {
        finalMessageToPatient += ` Which of those times works best for you?`;
      } else { // Should not happen if availableSlots.length > 0, but as a fallback
        finalMessageToPatient = `I found some availability on ${friendlyDate} for a ${appointmentTypeName}. Which time would you prefer from the options I mentioned?`;
      }

      return {
        success: true,
        message_to_patient: finalMessageToPatient,
        data: {
          requested_date: args.requestedDate,
          appointment_type_name: appointmentTypeName, // Add for context
          available_slots: formattedSlots, // Send all found slots in data
          has_availability: true,
          total_slots_found: availableSlots.length,
          formatted_times: formattedSlots.map(slot => slot.display_time) // All formatted times
        }
      };

    } catch (error) {
      console.error(`[checkAvailableSlots] Error:`, error);
      
      let message = "I'm having trouble checking availability right now. Please try again or call the office.";
      if (error instanceof Error && error.message.includes("401")) {
        message = "There's an authentication issue with the scheduling system. Please contact support.";
      }
      
      return {
        success: false,
        error_code: "AVAILABILITY_CHECK_ERROR",
        message_to_patient: message,
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me check our availability for you...",
    success: "The availability check is complete.",
    fail: "I'm having trouble checking our schedule right now."
  }
};

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

export default checkAvailableSlotsTool; 