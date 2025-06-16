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
  description: "Checks available appointment slots for a specific date and appointment type. Use after confirming patient identity and appointment type when patient requests a specific date.",
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

      // NEW LOGIC: Filter providers who accept this appointment type
      const appointmentType = practice.appointmentTypes?.find(
        at => at.nexhealthAppointmentTypeId === args.appointmentTypeId
      );

      if (!appointmentType) {
        return {
          success: false,
          error_code: "INVALID_APPOINTMENT_TYPE",
          message_to_patient: "I couldn't find that appointment type. Please contact the office for assistance."
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
          message_to_patient: `I don't see any providers available for ${appointmentType.name} appointments. Please contact the office for assistance.`
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

      if (availableSlots.length === 0) {
        // No slots found - let's provide more helpful information
        const appointmentTypeName = practice.appointmentTypes?.find(at => at.nexhealthAppointmentTypeId === args.appointmentTypeId)?.name || "that appointment type";
        const friendlyDate = formatDate(args.requestedDate);
        
        let messageToPatient = `I'm sorry, I don't see any available slots for a ${appointmentTypeName} on ${friendlyDate}.`;

        const otherAppointmentTypesExist = (practice.appointmentTypes?.length || 0) > 1;

        if (otherAppointmentTypesExist) {
          messageToPatient += ` Would you like me to check a different date for the ${appointmentTypeName}, or perhaps look at other appointment types for that day?`;
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

      let finalMessageToPatient = `Great! For a ${appointmentTypeName} on ${friendlyDate}, I have ${timeOptionsMessage} available.`;

      if (formattedSlots.length > slotsToOfferCount) {
        finalMessageToPatient += " Do any of those work, or would you like to hear more options?";
      } else {
        finalMessageToPatient += " Do any of those times work for you?";
      }

      return {
        success: true,
        message_to_patient: finalMessageToPatient,
        data: {
          requested_date: args.requestedDate,
          requested_appointment_type_id: args.appointmentTypeId,
          appointment_type_name: appointmentTypeName,
          available_slots: formattedSlots,
          has_availability: true,
          total_slots_found: availableSlots.length,
          slots_offered: slotsToOfferCount
        }
      };

    } catch (error) {
      console.error(`[checkAvailableSlots] Error:`, error);
      
      return {
        success: false,
        error_code: "SLOT_CHECK_ERROR",
        message_to_patient: "I'm having trouble checking availability right now. Please contact the office for scheduling assistance.",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me check what's available...",
    success: "Okay, availability check processed.",
    fail: "There was an issue checking availability."
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