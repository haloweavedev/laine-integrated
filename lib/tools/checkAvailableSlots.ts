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
    .describe(`Patient's requested date in YYYY-MM-DD format. Today: ${getCurrentDate()}. Examples: "December 23rd" → "2025-12-23", "next Friday" → calculate from ${getCurrentDate()}, "tomorrow" → calculate from ${getCurrentDate()}`),
  appointmentTypeId: z.string().min(1).describe("Appointment type ID from previous find_appointment_type tool call"),
  days: z.number().min(1).max(7).default(1).describe("Number of days to check (default 1)")
});

const checkAvailableSlotsTool: ToolDefinition<typeof checkAvailableSlotsSchema> = {
  name: "check_available_slots",
  description: `
    Checks and returns available appointment slots for a specific date and appointment type.
    WHEN TO USE: Call this tool AFTER 'find_appointment_type' has successfully provided an 'appointmentTypeId' AND the user has specified a 'requestedDate'.
    REQUIRED INPUTS: 'requestedDate' (YYYY-MM-DD format), 'appointmentTypeId' (from 'find_appointment_type' tool), 'days' (number of days to check, defaults to 1).
    OUTPUTS: On success, returns 'available_slots' (a list of time slots), 'appointment_type_name', 'requested_date_friendly', and 'has_availability' boolean.
    SEQUENCE NOTE: This tool typically follows 'find_appointment_type'. Do not call if 'appointmentTypeId' is unknown.
  `.trim(),
  schema: checkAvailableSlotsSchema,
  prerequisites: [
    {
      argName: 'appointmentTypeId',
      askUserMessage: "Okay, I can check on that. To find the right slots, could you first tell me what type of appointment you're looking for?"
    },
    {
      argName: 'requestedDate',
      askUserMessage: "And for which date would you like to check our availability?"
    }
  ],
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice } = context;
    
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
      // Get provider and operatory IDs from practice preferences
      const activeProviders = practice.savedProviders.filter(sp => sp.isActive);
      const activeOperatories = practice.savedOperatories?.filter(so => so.isActive) || [];

      if (activeProviders.length === 0) {
        return {
          success: false,
          error_code: "NO_ACTIVE_PROVIDERS",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "No active providers"
        };
      }

      // NEW LOGIC: Filter providers who accept this appointment type
      const appointmentType = practice.appointmentTypes?.find(
        at => at.nexhealthAppointmentTypeId === args.appointmentTypeId
      );

      if (!appointmentType) {
        return {
          success: false,
          error_code: "INVALID_APPOINTMENT_TYPE",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Appointment type not found"
        };
      }

      // Filter providers who accept this appointment type
      const eligibleProviders = activeProviders.filter(sp => {
        // If provider has no accepted appointment types configured, include them (backward compatibility)
        if (!sp.acceptedAppointmentTypes || sp.acceptedAppointmentTypes.length === 0) {
          return true;
        }
        // Otherwise, check if they accept this specific appointment type
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
            appointment_type_name: appointmentType.name
          }
        };
      }

      // Get provider array from eligible providers
      const providers = eligibleProviders.map(sp => sp.provider.nexhealthProviderId);
      
      // Collect operatory IDs from all eligible providers' assigned operatories
      const operatorySets = new Set<string>();
      eligibleProviders.forEach(sp => {
        if (sp.assignedOperatories && sp.assignedOperatories.length > 0) {
          sp.assignedOperatories.forEach(assignment => {
            operatorySets.add(assignment.savedOperatory.nexhealthOperatoryId);
          });
        }
      });
      
      // If no providers have specific operatory assignments, use all active operatories
      const operatories = operatorySets.size > 0 
        ? Array.from(operatorySets)
        : activeOperatories.map(so => so.nexhealthOperatoryId);

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

      const appointmentTypeName = appointmentType.name;
      const friendlyDate = formatDate(args.requestedDate);

      if (availableSlots.length === 0) {
        const otherAppointmentTypesExist = (practice.appointmentTypes?.length || 0) > 1;

        return {
          success: true,
          message_to_patient: "", // Will be filled by dynamic generation
          data: {
            requested_date: args.requestedDate,
            requested_date_friendly: friendlyDate,
            requested_appointment_type_id: args.appointmentTypeId,
            appointment_type_name: appointmentTypeName,
            available_slots: [],
            has_availability: false,
            other_appointment_types_exist: otherAppointmentTypesExist,
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

      // Offer a limited number of slots initially for voice, e.g., 3 or 4
      const slotsToOfferCount = Math.min(formattedSlots.length, 3); // Offer up to 3 slots
      const offeredTimeList = formattedSlots.slice(0, slotsToOfferCount).map(slot => slot.display_time);
      
      let timeOptionsMessage = "";
      if (offeredTimeList.length === 1) {
        timeOptionsMessage = offeredTimeList[0];
      } else if (offeredTimeList.length > 1) {
        timeOptionsMessage = offeredTimeList.slice(0, -1).join(', ') + (offeredTimeList.length > 1 ? ', or ' : '') + offeredTimeList[offeredTimeList.length - 1];
      }

      return {
        success: true,
        message_to_patient: "", // Will be filled by dynamic generation
        data: {
          requested_date: args.requestedDate,
          requested_date_friendly: friendlyDate,
          requested_appointment_type_id: args.appointmentTypeId,
          appointment_type_name: appointmentTypeName,
          available_slots: formattedSlots,
          has_availability: true,
          total_slots_found: availableSlots.length,
          slots_offered: slotsToOfferCount,
          // Hints for message generation:
          offered_time_list_string_for_message_suggestion: timeOptionsMessage,
          has_more_slots_beyond_offered: formattedSlots.length > slotsToOfferCount
        }
      };

    } catch (error) {
      console.error(`[checkAvailableSlots] Error:`, error);
      
      return {
        success: false,
        error_code: "SLOT_CHECK_ERROR",
        message_to_patient: "", // Will be filled by dynamic generation
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

export default checkAvailableSlotsTool; 