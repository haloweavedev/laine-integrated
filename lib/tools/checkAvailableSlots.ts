import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";

export const checkAvailableSlotsSchema = z.object({
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").describe("The date the patient wants to schedule for in YYYY-MM-DD format"),
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

      // Build search params object for fetch using URLSearchParams
      const urlParams = new URLSearchParams();
      urlParams.append('subdomain', practice.nexhealthSubdomain);
      urlParams.append('start_date', args.requestedDate);
      urlParams.append('days', args.days.toString());
      urlParams.append('appointment_type_id', args.appointmentTypeId);
      urlParams.append('lids[]', practice.nexhealthLocationId);

      // Add each provider ID as separate parameter
      providers.forEach(providerId => {
        urlParams.append('pids[]', providerId);
      });

      // Add each operatory ID as separate parameter (if configured)
      if (operatories.length > 0) {
        operatories.forEach(operatoryId => {
          urlParams.append('operatory_ids[]', operatoryId);
        });
      }

      // Convert URLSearchParams to object for the API call
      const searchParams = Object.fromEntries(urlParams.entries());

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
        return {
          success: true,
          message_to_patient: `I don't see any available slots for ${formatDate(args.requestedDate)}. Would you like me to check a different date, or would you prefer to call the office for more options?`,
          data: {
            requested_date: args.requestedDate,
            available_slots: [],
            has_availability: false
          }
        };
      }

      // Format slots for patient-friendly display
      const formattedSlots = availableSlots.slice(0, 8).map((slot, index) => {
        const startTime = new Date(slot.time);
        const timeString = startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
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

      const timeOptions = formattedSlots.map(slot => slot.display_time).join(', ');

      return {
        success: true,
        message_to_patient: `Great! I found available times for ${formatDate(args.requestedDate)}: ${timeOptions}. What time works best for you?`,
        data: {
          requested_date: args.requestedDate,
          available_slots: formattedSlots,
          has_availability: true,
          total_slots_found: availableSlots.length
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
    start: "Let me check what times are available for you...",
    success: "Found available appointment times.",
    fail: "I'm having trouble checking availability right now."
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