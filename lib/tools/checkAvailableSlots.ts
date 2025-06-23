import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";

// Generate current date dynamically for LLM context
function getCurrentDate(): string {
  const today = new Date();
  return today.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

// Helper function to check if a time falls within lunch break (1-2 PM local time)
function isLunchBreakSlot(slotTimeString: string, practiceTimezone: string = 'America/Chicago'): boolean {
  try {
    // Parse the slot time which includes timezone info (e.g., "2025-12-29T07:00:00.000-06:00")
    const slotTime = new Date(slotTimeString);
    
    // Convert to practice timezone
    const localTime = slotTime.toLocaleString('en-US', {
      timeZone: practiceTimezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const [hour, minute] = localTime.split(':').map(Number);
    const totalMinutes = hour * 60 + minute;
    
    // Lunch break: 1:00 PM (13:00) to 2:00 PM (14:00) - 780 to 840 minutes from midnight
    const lunchStart = 13 * 60; // 1 PM in minutes
    const lunchEnd = 14 * 60;   // 2 PM in minutes
    
    return totalMinutes >= lunchStart && totalMinutes < lunchEnd;
  } catch (error) {
    console.error('Error parsing slot time for lunch break check:', error);
    return false; // If we can't parse, don't filter out the slot
  }
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
  appointmentTypeId: z.string().min(1).describe("Appointment type ID (Laine CUID) from previous find_appointment_type tool call"),
  days: z.number().min(1).max(7).default(1).describe("Number of days to check (default 1)"),
  providerIds: z.array(z.string()).optional().describe("Optional array of provider IDs (Laine CUIDs of SavedProvider) to filter by"),
  operatoryIds: z.array(z.string()).optional().describe("Optional array of operatory IDs (Laine CUIDs of SavedOperatory) to filter by")
});

const checkAvailableSlotsTool: ToolDefinition<typeof checkAvailableSlotsSchema> = {
  name: "check_available_slots",
  description: "Checks and returns available appointment slots for a specific date and appointment type. Call after find_appointment_type provides appointmentTypeId and user specifies requestedDate. Returns available_slots, appointment_type_name, requested_date_friendly, has_availability. Follows find_appointment_type tool.",
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
    const { practice, conversationState } = context;
    
    console.log("=== CHECK AVAILABLE SLOTS - START ===");
    console.log("Received appointmentTypeId (Laine CUID):", args.appointmentTypeId);
    console.log("Received requestedDate:", args.requestedDate);
    console.log("Received providerIds (optional):", args.providerIds);
    console.log("Received operatoryIds (optional):", args.operatoryIds);
    console.log("Days to search:", args.days);
    
    // Check practice configuration
    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return {
        success: false,
        error_code: "PRACTICE_CONFIG_MISSING",
        message_to_patient: "",
        details: "Missing practice NexHealth configuration"
      };
    }

    if (!practice.savedProviders || practice.savedProviders.length === 0) {
      return {
        success: false,
        error_code: "NO_SAVED_PROVIDERS",
        message_to_patient: "",
        details: "No providers configured"
      };
    }

    try {
      // CRUCIAL STEP A: Get appointment type from ConversationState first, then validate against args
      let appointmentTypeId = conversationState.determinedAppointmentTypeId;
      
      // If not in conversation state, use the one from args
      if (!appointmentTypeId) {
        appointmentTypeId = args.appointmentTypeId;
        console.log("⚠️ appointmentTypeId not found in ConversationState, using from args");
      }
      
      // Verify they match if both are present
      if (conversationState.determinedAppointmentTypeId && 
          conversationState.determinedAppointmentTypeId !== args.appointmentTypeId) {
        console.log("⚠️ appointmentTypeId mismatch between ConversationState and args, prioritizing ConversationState");
        appointmentTypeId = conversationState.determinedAppointmentTypeId;
      }

      // Find the AppointmentType record using Laine CUID
      const appointmentType = practice.appointmentTypes?.find(
        at => at.id === appointmentTypeId
      );

      if (!appointmentType) {
        console.log("❌ AppointmentType not found for Laine CUID:", appointmentTypeId);
        return {
          success: false,
          error_code: "INVALID_APPOINTMENT_TYPE",
          message_to_patient: "",
          details: "Appointment type not found or doesn't belong to practice"
        };
      }

      // Use determinedDurationMinutes from ConversationState (CRITICAL)
      const slotLength = conversationState.determinedDurationMinutes || appointmentType.duration;
      
      console.log("✅ Found AppointmentType:");
      console.log("  - Laine CUID:", appointmentType.id);
      console.log("  - Name:", appointmentType.name);
      console.log("  - Duration (for slot_length):", slotLength);
      console.log("  - NexHealth ID:", appointmentType.nexhealthAppointmentTypeId);

      // CRUCIAL STEP B: Find all SavedProviders who are active and accept this appointment type
      let eligibleSavedProviders = practice.savedProviders.filter(sp => {
        // Must be active
        if (!sp.isActive) return false;
        
        // If provider has no accepted appointment types configured, include them (backward compatibility)
        if (!sp.acceptedAppointmentTypes || sp.acceptedAppointmentTypes.length === 0) {
          return true;
        }
        
        // Otherwise, check if they accept this specific appointment type using Laine CUID
        return sp.acceptedAppointmentTypes.some(
          relation => relation.appointmentType.id === appointmentType.id
        );
      });

      console.log("📋 Provider filtering - Step 1 (Active + Accept AppointmentType):");
      console.log("  - Total active SavedProviders in practice:", practice.savedProviders.filter(sp => sp.isActive).length);
      console.log("  - SavedProviders accepting this AppointmentType:", eligibleSavedProviders.length);

      // Apply optional provider filter
      if (args.providerIds && args.providerIds.length > 0) {
        const beforeFilterCount = eligibleSavedProviders.length;
        eligibleSavedProviders = eligibleSavedProviders.filter(sp => 
          args.providerIds!.includes(sp.id)
        );
        console.log("📋 Provider filtering - Step 2 (Optional provider filter):");
        console.log("  - Before provider filter:", beforeFilterCount);
        console.log("  - After provider filter:", eligibleSavedProviders.length);
      }

      if (eligibleSavedProviders.length === 0) {
        console.log("❌ No providers match the criteria");
        return {
          success: false,
          error_code: "NO_PROVIDERS_FOR_TYPE",
          message_to_patient: "",
          data: {
            appointment_type_name: appointmentType.name
          }
        };
      }

      // STEP 3: Collect unique nexhealthProviderId values for NexHealth API
      const nexhealthProviderIds = [...new Set(
        eligibleSavedProviders.map(sp => sp.provider.nexhealthProviderId)
      )];

      console.log("🔗 NexHealth Provider IDs extracted:", nexhealthProviderIds);

      // CRUCIAL STEP C: Get operatories assigned to these eligible providers
      const eligibleOperatories: Array<{
        id: string;
        nexhealthOperatoryId: string;
        name: string;
      }> = [];

      for (const savedProvider of eligibleSavedProviders) {
        // Get operatories assigned to this provider
        const assignedOperatories = savedProvider.assignedOperatories?.map(assignment => assignment.savedOperatory) || [];
        eligibleOperatories.push(...assignedOperatories);
      }

      // Remove duplicates
      const uniqueOperatories = eligibleOperatories.filter((operatory, index, self) => 
        index === self.findIndex(o => o.id === operatory.id)
      );

      console.log("🏢 Operatory derivation - Step 1 (From eligible providers):");
      console.log("  - Operatories derived from eligible providers:", uniqueOperatories.length);

      // Apply optional operatory filter
      let finalOperatories = uniqueOperatories;
      if (args.operatoryIds && args.operatoryIds.length > 0) {
        const beforeFilterCount = finalOperatories.length;
        finalOperatories = uniqueOperatories.filter(operatory => 
          args.operatoryIds!.includes(operatory.id)
        );
        console.log("🏢 Operatory derivation - Step 2 (Optional operatory filter):");
        console.log("  - Before operatory filter:", beforeFilterCount);
        console.log("  - After operatory filter:", finalOperatories.length);
      }

      // Extract nexhealthOperatoryIds for the API call
      const nexhealthOperatoryIds = finalOperatories.map(operatory => operatory.nexhealthOperatoryId);

      console.log("🔗 NexHealth Operatory IDs extracted:", nexhealthOperatoryIds);

      // Build NexHealth API parameters with correct requirements
      const params: Record<string, string | number | string[]> = {
        start_date: args.requestedDate,
        days: args.days,
        'lids[]': [practice.nexhealthLocationId],
        'pids[]': nexhealthProviderIds,
        slot_length: slotLength, // CRITICAL: Use duration from ConversationState or AppointmentType
        overlapping_operatory_slots: 'false' // CRITICAL: Explicitly set to false as string
      };

      // Add operatory IDs if we have any
      if (nexhealthOperatoryIds.length > 0) {
        params['operatory_ids[]'] = nexhealthOperatoryIds;
      }

      // CRITICAL: DO NOT send appointment_type_id to NexHealth
      console.log("🚀 NEXHEALTH API CALL PARAMETERS:");
      console.log("  - Endpoint: /appointment_slots");
      console.log("  - Subdomain:", practice.nexhealthSubdomain);
      console.log("  - Params:", JSON.stringify(params, null, 2));
      console.log("  - IMPORTANT: slot_length =", slotLength);
      console.log("  - IMPORTANT: overlapping_operatory_slots = 'false'");
      console.log("  - IMPORTANT: NO appointment_type_id parameter sent to NexHealth");

      // Call NexHealth API
      const slotsResponse = await fetchNexhealthAPI(
        '/appointment_slots',
        practice.nexhealthSubdomain,
        params
      );

      console.log("📡 NexHealth API Response received");

      // Parse response and extract slots
      interface NexhealthSlot {
        time: string;
        end_time: string;
        operatory_id?: number;
        provider_id: number;
        location_id: number;
        [key: string]: unknown;
      }
      const rawSlots: Array<NexhealthSlot> = [];
      
      if (slotsResponse?.data && Array.isArray(slotsResponse.data)) {
        // Extract all slots from all providers
        for (const providerData of slotsResponse.data) {
                     if (providerData.slots && Array.isArray(providerData.slots)) {
                          rawSlots.push(...providerData.slots.map((slot: unknown) => ({
               ...(slot as Record<string, unknown>),
              provider_id: providerData.pid,
              location_id: providerData.lid
            })));
          }
        }
      }

      console.log("📊 Slot processing:");
      console.log("  - Raw slots from NexHealth API:", rawSlots.length);

      // Filter out lunch break slots using practice timezone
      const practiceTimezone = practice.timezone || 'America/Chicago';
      const filteredSlots = rawSlots.filter(slot => !isLunchBreakSlot(slot.time, practiceTimezone));

      console.log("  - Slots after lunch break filtering:", filteredSlots.length);
      console.log("  - Lunch break slots filtered out:", rawSlots.length - filteredSlots.length);
      if (practice.timezone) {
        console.log("  - Using practice timezone:", practice.timezone);
      } else {
        console.log("  - Using default timezone (America/Chicago) - consider setting practice.timezone");
      }

      // Create provider lookup map
      const providerLookup = new Map();
      eligibleSavedProviders.forEach(sp => {
        providerLookup.set(sp.provider.nexhealthProviderId, {
          id: sp.provider.id,
          nexhealthProviderId: sp.provider.nexhealthProviderId,
          name: `${sp.provider.firstName || ''} ${sp.provider.lastName}`.trim()
        });
      });

      // Create operatory lookup map
      const operatoryLookup = new Map();
      finalOperatories.forEach(operatory => {
        operatoryLookup.set(operatory.nexhealthOperatoryId, {
          id: operatory.id,
          nexhealthOperatoryId: operatory.nexhealthOperatoryId,
          name: operatory.name
        });
      });

      // Format slots for display with enhanced information
      const formattedSlots = filteredSlots.map((slot, index) => {
        // Parse the time string correctly to preserve the timezone
        const startTime = new Date(slot.time);
        const endTime = new Date(slot.end_time);
        
        // Use the practice timezone for formatting
        const timeString = startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: practiceTimezone
        });

        const endTimeString = endTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: practiceTimezone
        });

        // Get provider and operatory details
        const providerInfo = providerLookup.get(slot.provider_id.toString()) || { 
          name: `Provider ${slot.provider_id}`, 
          nexhealthProviderId: slot.provider_id 
        };
        
        const operatoryInfo = slot.operatory_id ? 
          operatoryLookup.get(slot.operatory_id.toString()) || { 
            name: `Operatory ${slot.operatory_id}`, 
            nexhealthOperatoryId: slot.operatory_id 
          } : null;
        
        return {
          slot_id: `slot_${index}`,
          time: slot.time,
          end_time: slot.end_time,
          display_time: timeString,
          display_end_time: endTimeString,
          display_range: `${timeString} - ${endTimeString}`,
          operatory_id: slot.operatory_id,
          provider_id: slot.provider_id,
          location_id: slot.location_id,
          provider_info: providerInfo,
          operatory_info: operatoryInfo
        };
      });

      // Sort slots by time
      formattedSlots.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

      const appointmentTypeName = appointmentType.name;
      const friendlyDate = formatDate(args.requestedDate);

      // Update ConversationState
      conversationState.updateRequestedDate(args.requestedDate);
      conversationState.availableSlotsForDate = formattedSlots;

      if (formattedSlots.length === 0) {
        console.log("✅ No slots available - returning no availability result");
        return {
          success: true,
          message_to_patient: "",
          data: {
            requested_date: args.requestedDate,
            requested_date_friendly: friendlyDate,
            appointment_type_name: appointmentTypeName,
            available_slots: [],
            has_availability: false,
            debug_info: {
              slot_length_used: slotLength,
              raw_slots_before_lunch_filter: rawSlots.length,
              slots_after_lunch_filter: filteredSlots.length,
              providers_checked: eligibleSavedProviders.length,
              operatories_checked: finalOperatories.length
            }
          }
        };
      }

      // Offer a limited number of slots initially for voice, e.g., 3 or 4
      const slotsToOfferCount = Math.min(formattedSlots.length, 3);
      const offeredTimeList = formattedSlots.slice(0, slotsToOfferCount).map(slot => slot.display_time);
      
      let timeOptionsMessage = "";
      if (offeredTimeList.length === 1) {
        timeOptionsMessage = offeredTimeList[0];
      } else if (offeredTimeList.length > 1) {
        timeOptionsMessage = offeredTimeList.slice(0, -1).join(', ') + (offeredTimeList.length > 1 ? ', or ' : '') + offeredTimeList[offeredTimeList.length - 1];
      }

      console.log("✅ Final result:", formattedSlots.length, "formatted slots ready to return");
      console.log("=== CHECK AVAILABLE SLOTS - COMPLETED ===");

      return {
        success: true,
        message_to_patient: "",
        data: {
          requested_date: args.requestedDate,
          requested_date_friendly: friendlyDate,
          appointment_type_name: appointmentTypeName,
          available_slots: formattedSlots,
          has_availability: true,
          total_slots_found: formattedSlots.length,
          slots_offered: slotsToOfferCount,
          offered_time_list_string_for_message_suggestion: timeOptionsMessage,
          has_more_slots_beyond_offered: formattedSlots.length > slotsToOfferCount,
          debug_info: {
            slot_length_used: slotLength,
            overlapping_operatory_slots_param: 'false',
            raw_slots_before_lunch_filter: rawSlots.length,
            slots_after_lunch_filter: filteredSlots.length,
            lunch_break_slots_filtered: rawSlots.length - filteredSlots.length,
            providers_checked: eligibleSavedProviders.length,
            operatories_checked: finalOperatories.length,
            practice_timezone_used: practiceTimezone
          }
        }
      };

    } catch (error) {
      console.error(`[checkAvailableSlots] Error:`, error);
      
      return {
        success: false,
        error_code: "SLOT_CHECK_ERROR",
        message_to_patient: "",
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