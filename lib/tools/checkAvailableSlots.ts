import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";

// Generate current date dynamically for LLM context
function getCurrentDate(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-based
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Get current day name for better LLM context
function getCurrentDayInfo(): string {
  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = today.toLocaleDateString('en-US', { month: 'long' });
  return `Today is ${dayName}, ${monthName} ${today.getDate()}, ${today.getFullYear()}`;
}

export const checkAvailableSlotsSchema = z.object({
  requestedDate: z.string()
    .min(1)
    .refine((date) => {
      // Simple validation to ensure YYYY-MM-DD format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return false;
      }
      // Validate it's a real date
      const parsedDate = new Date(date);
      return !isNaN(parsedDate.getTime()) && date === parsedDate.toISOString().split('T')[0];
    }, "Date must be in YYYY-MM-DD format and be a valid date")
    .describe(`
Convert the patient's natural language date request to YYYY-MM-DD format.

CURRENT DATE CONTEXT:
- ${getCurrentDayInfo()}
- Current date: ${getCurrentDate()}

EXAMPLES OF CONVERSIONS:
- "December twenty third" → "2025-12-23"
- "December 23rd" → "2025-12-23" 
- "next Friday" → calculate the next Friday from ${getCurrentDate()}
- "tomorrow" → calculate tomorrow from ${getCurrentDate()}
- "Monday" → calculate the next Monday from ${getCurrentDate()}
- "next week" → calculate a date next week from ${getCurrentDate()}
- "Christmas" → "2025-12-25" (if current year) or "2025-12-25" (if Christmas has passed)

IMPORTANT INSTRUCTIONS:
1. Always return dates in YYYY-MM-DD format
2. If year is not specified, assume the next occurrence of that date
3. If the specified date has already passed this year, use next year
4. For relative dates like "tomorrow", "next Friday", calculate from current date: ${getCurrentDate()}
5. If the date is ambiguous or unclear, ask the patient for clarification

Current date for calculations: ${getCurrentDate()}
    `),
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
        
        // Check if this is a systemic issue or specific to this appointment type
        // by testing with a different appointment type that's known to have availability
        let suggestionMessage = `I don't see any available slots for ${formatDate(args.requestedDate)}.`;
        
        // Try to find alternative appointment types that might have availability
        const allAppointmentTypes = practice.appointmentTypes || [];
        if (allAppointmentTypes.length > 1) {
          const currentType = allAppointmentTypes.find(at => at.nexhealthAppointmentTypeId === args.appointmentTypeId);
          const otherTypes = allAppointmentTypes.filter(at => at.nexhealthAppointmentTypeId !== args.appointmentTypeId);
          
          if (currentType && otherTypes.length > 0) {
            console.log(`[checkAvailableSlots] Current appointment type: ${currentType.name} (${args.appointmentTypeId})`);
            console.log(`[checkAvailableSlots] Other available types:`, otherTypes.map(t => `${t.name} (${t.nexhealthAppointmentTypeId})`));
            suggestionMessage += ` Would you like me to check availability for a different type of appointment, or would you prefer to call the office?`;
          }
        }
        
        // Also suggest checking different dates
        suggestionMessage += ` You can also ask me to check a different date.`;

        return {
          success: true,
          message_to_patient: suggestionMessage,
          data: {
            requested_date: args.requestedDate,
            requested_appointment_type_id: args.appointmentTypeId,
            available_slots: [],
            has_availability: false,
            debug_info: {
              providers_checked: providers.length,
              operatories_checked: operatories.length,
              appointment_type_name: allAppointmentTypes.find(at => at.nexhealthAppointmentTypeId === args.appointmentTypeId)?.name || 'Unknown'
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

      // Create a comprehensive list of times for TTS-friendly presentation
      const timeList = formattedSlots.map(slot => slot.display_time);
      const timeOptions = timeList.length > 1 
        ? timeList.slice(0, -1).join(', ') + ', and ' + timeList[timeList.length - 1]
        : timeList[0];

      return {
        success: true,
        message_to_patient: `Great! I have these times available for ${formatDate(args.requestedDate)}: ${timeOptions}. Which time would you prefer?`,
        data: {
          requested_date: args.requestedDate,
          available_slots: formattedSlots,
          has_availability: true,
          total_slots_found: availableSlots.length,
          formatted_times: timeList
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
    success: "I found some great options for you!",
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