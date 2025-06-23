import { z } from "zod";
import { ToolDefinition, ToolResult, conversationStateSchema } from "./types";
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
  operatoryIds: z.array(z.string()).optional().describe("Optional array of operatory IDs (Laine CUIDs of SavedOperatory) to filter by"),
  conversationState: conversationStateSchema,
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
  
  /**
   * Comprehensive slot checking tool that accurately retrieves, filters, and formats appointment slots
   * from NexHealth API. Implements robust provider and operatory filtering based on practice configuration,
   * uses conversation state for appointment type and duration, applies practice timezone for lunch filtering
   * and display formatting, and returns well-structured slot data enriched with Laine-specific details.
   * 
   * Key Features:
   * - Prioritizes ConversationState for appointmentTypeId and duration
   * - Filters providers by activity status and appointment type acceptance
   * - Derives operatories from eligible providers for accurate filtering
   * - Uses practice timezone for lunch break filtering and display formatting
   * - Constructs precise NexHealth API parameters (no appointment_type_id sent)
   * - Enriches slots with Laine provider and operatory details
   * - Updates ConversationState with results
   * 
   * @param {Object} params - Tool execution parameters
   * @param {Object} params.args - Tool arguments from schema
   * @param {Object} params.context - Execution context with practice and conversationState
   * @returns {Promise<ToolResult>} Comprehensive result with slots and debug information
   */
  async run({ args, context }): Promise<ToolResult> {
    const { practice, conversationState } = context;
    
    console.log("=== CHECK AVAILABLE SLOTS - START ===");
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
      // **Step A: Get Laine AppointmentType Details & slot_length**
      console.log("🎯 STEP A: APPOINTMENT TYPE & SLOT LENGTH VALIDATION");
      console.log("========================================================");
      
      const appointmentTypeIdFromState = conversationState.determinedAppointmentTypeId;
      const slotLength = conversationState.determinedDurationMinutes;

      if (!appointmentTypeIdFromState || !slotLength) {
        console.error("[checkAvailableSlots] Critical context missing from ConversationState:");
        console.log("  - determinedAppointmentTypeId:", appointmentTypeIdFromState);
        console.log("  - determinedDurationMinutes:", slotLength);
        
        return {
          success: false,
          error_code: "MISSING_APPOINTMENT_CONTEXT_FOR_SLOTS",
          message_to_patient: "",
          details: "Appointment type or duration not determined in ConversationState before checking slots."
        };
      }
      
      const currentAppointmentType = practice.appointmentTypes?.find(
        at => at.id === appointmentTypeIdFromState
      );

      if (!currentAppointmentType) {
        console.error("[checkAvailableSlots] AppointmentType not found for ConversationState appointmentTypeId:", appointmentTypeIdFromState);
        return {
          success: false,
          error_code: "INVALID_APPOINTMENT_TYPE_IN_STATE",
          message_to_patient: "",
          details: "Appointment type from ConversationState not found in practice configuration"
        };
      }

      const appointmentTypeNameForMessages = currentAppointmentType.name;
      
      console.log("✅ Using ConversationState data:");
      console.log("  - Appointment Type ID (Laine CUID):", appointmentTypeIdFromState);
      console.log("  - Appointment Type Name:", appointmentTypeNameForMessages);
      console.log("  - Duration (slot_length):", slotLength, "minutes");
      console.log("  - NexHealth Appointment Type ID:", currentAppointmentType.nexhealthAppointmentTypeId);

      // **Step B: Determine eligibleSavedProviders**
      console.log("\n👨‍⚕️ STEP B: DETERMINE ELIGIBLE SAVED PROVIDERS");
      console.log("==============================================");
      
      // Start with practice.savedProviders (already pre-filtered by isActive: true from fetchPracticeWithSchedulingData)
      const activeSavedProviders = practice.savedProviders; // Already filtered by isActive: true in Prisma query
      console.log("📋 Step B.1 - Active SavedProviders from practice:", activeSavedProviders.length);
      
      // Filter to providers that accept this appointment type
      const eligibleSavedProviders = activeSavedProviders.filter(sp => {
        // If provider has no accepted appointment types configured, include them (backward compatibility)
        if (!sp.acceptedAppointmentTypes || sp.acceptedAppointmentTypes.length === 0) {
          console.log(`  - Provider ${sp.provider.firstName} ${sp.provider.lastName}: accepts all (no restrictions)`);
          return true;
        }
        
        // Check if they accept this specific appointment type using Laine CUID
        const acceptsType = sp.acceptedAppointmentTypes.some(
          aat => aat.appointmentType.id === appointmentTypeIdFromState
        );
        console.log(`  - Provider ${sp.provider.firstName} ${sp.provider.lastName}: accepts this type = ${acceptsType} (${sp.acceptedAppointmentTypes.length} restrictions)`);
        return acceptsType;
      });

      console.log("📋 Step B.2 - SavedProviders accepting this AppointmentType:", eligibleSavedProviders.length);

      // Apply optional provider filter (if args.providerIds are provided)
      if (args.providerIds && args.providerIds.length > 0) {
        const beforeFilterCount = eligibleSavedProviders.length;
        const finalEligibleProviders = eligibleSavedProviders.filter(sp => 
          args.providerIds!.includes(sp.id) // sp.id is the Laine CUID of SavedProvider
        );
        console.log("📋 Step B.3 - Optional provider ID filter applied:");
        console.log("  - Before provider ID filter:", beforeFilterCount);
        console.log("  - After provider ID filter:", finalEligibleProviders.length);
        console.log("  - Provider IDs requested:", args.providerIds);
        console.log("  - Matched SavedProvider IDs:", finalEligibleProviders.map(sp => sp.id));
        
        // Update eligibleSavedProviders with filtered result
        eligibleSavedProviders.splice(0, eligibleSavedProviders.length, ...finalEligibleProviders);
      }

      if (eligibleSavedProviders.length === 0) {
        console.log("❌ No providers match the criteria");
        return {
          success: false,
          error_code: "NO_PROVIDERS_FOR_APPOINTMENT_TYPE",
          message_to_patient: "",
          data: {
            appointment_type_name: appointmentTypeNameForMessages
          }
        };
      }

      // **Step C: Extract nexhealthProviderIdsForAPI**
      console.log("\n🔗 STEP C: EXTRACT NEXHEALTH PROVIDER IDS FOR API");
      console.log("================================================");
      
      const nexhealthProviderIdsForAPI = [...new Set(
        eligibleSavedProviders.map(sp => sp.provider.nexhealthProviderId)
      )];

      console.log("🔗 NexHealth Provider IDs extracted for API:", nexhealthProviderIdsForAPI);
      console.log("📋 Eligible provider details:");
      eligibleSavedProviders.forEach(sp => {
        console.log(`  - ${sp.provider.firstName || ''} ${sp.provider.lastName || ''}`.trim());
        console.log(`    SavedProvider ID (Laine): ${sp.id}`);
        console.log(`    Provider ID (Laine): ${sp.provider.id}`);
        console.log(`    NexHealth Provider ID: ${sp.provider.nexhealthProviderId}`);
        console.log(`    Accepted appointment types: ${sp.acceptedAppointmentTypes?.length || 0}`);
      });

      if (nexhealthProviderIdsForAPI.length === 0) {
        console.error("❌ No NexHealth Provider IDs found - this should not happen if eligibleSavedProviders exist");
        return {
          success: false,
          error_code: "NO_PROVIDERS_FOR_APPOINTMENT_TYPE",
          message_to_patient: "",
          details: "No valid NexHealth Provider IDs found"
        };
      }

      // **Step D: Determine finalEligibleOperatories and nexhealthOperatoryIdsForAPI**
      console.log("\n🏥 STEP D: DETERMINE ELIGIBLE OPERATORIES AND NEXHEALTH IDS");
      console.log("==========================================================");
      
      const allProviderAssignedOperatories: Array<{
        id: string;
        name: string;
        nexhealthOperatoryId: string;
        isActive: boolean;
      }> = [];

      // Loop through eligibleSavedProviders to collect operatories
      for (const savedProvider of eligibleSavedProviders) {
        console.log(`[CheckSlots-Operatories] Processing provider: ${savedProvider.provider.firstName} ${savedProvider.provider.lastName} (SavedProvider ID: ${savedProvider.id})`);
        console.log(`[CheckSlots-Operatories] Provider's raw assignedOperatories relation:`, JSON.stringify(savedProvider.assignedOperatories, null, 2));
        
        const activeAssignedOps = savedProvider.assignedOperatories?.map(assignment => assignment.savedOperatory).filter(op => op && op.isActive) || [];
        console.log(`[CheckSlots-Operatories] Active assigned operatories for this provider: ${activeAssignedOps.length}`);
        
        activeAssignedOps.forEach(op => {
          console.log(`[CheckSlots-Operatories]   • ${op.name} (Laine ID: ${op.id}, NexHealth ID: ${op.nexhealthOperatoryId}, Active: ${op.isActive})`);
        });
        
        allProviderAssignedOperatories.push(...activeAssignedOps);
      }

      // Deduplicate allProviderAssignedOperatories based on savedOperatory.id (Laine CUID)
      const uniqueOperatoriesMap = new Map();
      allProviderAssignedOperatories.forEach(operatory => {
        uniqueOperatoriesMap.set(operatory.id, operatory);
      });
      const uniqueActiveOperatories = Array.from(uniqueOperatoriesMap.values());

      console.log("🏢 Step D.1 - Operatory collection results:");
      console.log("  - All assigned operatories (with duplicates):", allProviderAssignedOperatories.length);
      console.log("  - Unique active operatories:", uniqueActiveOperatories.length);

      // Apply optional operatory filter (if args.operatoryIds are provided)
      let finalEligibleOperatories = uniqueActiveOperatories;
      if (args.operatoryIds && args.operatoryIds.length > 0) {
        const beforeFilterCount = finalEligibleOperatories.length;
        finalEligibleOperatories = uniqueActiveOperatories.filter(operatory => 
          args.operatoryIds!.includes(operatory.id) // operatory.id is the Laine CUID of SavedOperatory
        );
        console.log("🏢 Step D.2 - Optional operatory ID filter applied:");
        console.log("  - Before operatory ID filter:", beforeFilterCount);
        console.log("  - After operatory ID filter:", finalEligibleOperatories.length);
        console.log("  - Operatory IDs requested:", args.operatoryIds);
        console.log("  - Matched SavedOperatory IDs:", finalEligibleOperatories.map(op => op.id));
      }

      const nexhealthOperatoryIdsForAPI = [...new Set(finalEligibleOperatories.map(op => op.nexhealthOperatoryId))];

      console.log("[CheckSlots-Operatories] FINAL NexHealth Operatory IDs for API call:", JSON.stringify(nexhealthOperatoryIdsForAPI, null, 2));
      console.log("📋 Final operatory details:");
      finalEligibleOperatories.forEach(op => {
        console.log(`  - ${op.name} (Laine ID: ${op.id}, NexHealth ID: ${op.nexhealthOperatoryId})`);
      });

      // Log warning if no operatories but allow API call to proceed
      if (nexhealthOperatoryIdsForAPI.length === 0) {
        console.warn("⚠️ WARNING: No active operatories assigned to eligible providers! API call will proceed without operatory filter.");
      }

      // **Step E: Prepare NexHealth API Parameters**
      console.log("\n🚀 STEP E: PREPARE NEXHEALTH API PARAMETERS");
      console.log("==========================================");
      
      // Retrieve practiceTimezone from context.practice.timezone with fallback
      const practiceTimezone = practice.timezone || 'America/Chicago';
      if (practice.timezone) {
        console.log("✅ Using practice timezone:", practice.timezone);
      } else {
        console.log("⚠️ Using default timezone (America/Chicago) for slot processing. Consider setting practice.timezone in practice configuration for accuracy.");
      }
      
      // Build NexHealth API parameters precisely per NexHealth requirements
      const params: Record<string, string | number | string[]> = {
        start_date: args.requestedDate,
        days: args.days,
        'lids[]': [practice.nexhealthLocationId],
        'pids[]': nexhealthProviderIdsForAPI,
        slot_length: slotLength,
        overlapping_operatory_slots: 'false' // CRITICAL: Must be string 'false'
      };

      // CRITICAL: Only add operatory_ids[] if the array is not empty
      if (nexhealthOperatoryIdsForAPI.length > 0) {
        params['operatory_ids[]'] = nexhealthOperatoryIdsForAPI;
        console.log("✅ Including operatory filter with", nexhealthOperatoryIdsForAPI.length, "operatories");
      } else {
        console.log("ℹ️ No operatory filter - querying across all available operatories for providers");
      }

      console.log("📋 Final API parameters:");
      console.log("  - Endpoint: /appointment_slots");
      console.log("  - Subdomain:", practice.nexhealthSubdomain);
      console.log("  - Params:", JSON.stringify(params, null, 2));
      console.log("  ✅ IMPORTANT: slot_length =", slotLength, "(from ConversationState)");
      console.log("  ✅ IMPORTANT: overlapping_operatory_slots = 'false'");
      console.log("  ✅ IMPORTANT: NO appointment_type_id parameter sent to NexHealth (as required)");

      // Call NexHealth API
      const slotsResponse = await fetchNexhealthAPI(
        '/appointment_slots',
        practice.nexhealthSubdomain,
        params
      );

      console.log("📡 NexHealth API Response received");

      // **Step F: Process Response & Enrich Slots**
      console.log("\n📊 STEP F: PROCESS RESPONSE & ENRICH SLOTS");
      console.log("=========================================");
      
      // Parse Raw Slots from NexHealth response
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

      console.log("📊 Raw slot parsing:");
      console.log("  - Raw slots from NexHealth API:", rawSlots.length);

      // Lunch Break Filtering using practice timezone
      const filteredSlots = rawSlots.filter(slot => !isLunchBreakSlot(slot.time, practiceTimezone));

      console.log("📊 Lunch break filtering:");
      console.log("  - Slots after lunch break filtering:", filteredSlots.length);
      console.log("  - Lunch break slots filtered out:", rawSlots.length - filteredSlots.length);
      console.log("  - Practice timezone used for filtering:", practiceTimezone);

      // Create lookup maps for enriching slot data
      console.log("📊 Creating lookup maps for slot enrichment:");
      
      // Provider lookup map (NexHealth Provider ID -> Laine Provider details)
      const providerLookup = new Map();
      eligibleSavedProviders.forEach(sp => {
        providerLookup.set(sp.provider.nexhealthProviderId, {
          id: sp.provider.id, // Laine Provider CUID
          savedProviderId: sp.id, // Laine SavedProvider CUID
          nexhealthProviderId: sp.provider.nexhealthProviderId,
          name: `${sp.provider.firstName || ''} ${sp.provider.lastName || ''}`.trim()
        });
      });
      console.log("  - Provider lookup map entries:", providerLookup.size);

      // Operatory lookup map (NexHealth Operatory ID -> Laine SavedOperatory details)
      const operatoryLookup = new Map();
      finalEligibleOperatories.forEach(operatory => {
        operatoryLookup.set(operatory.nexhealthOperatoryId, {
          id: operatory.id, // Laine SavedOperatory CUID
          nexhealthOperatoryId: operatory.nexhealthOperatoryId,
          name: operatory.name
        });
      });
      console.log("  - Operatory lookup map entries:", operatoryLookup.size);

      // Format Slots with Laine-specific enrichment and practice timezone formatting
      console.log("📊 Formatting and enriching slots:");
      const formattedSlots = filteredSlots.map((slot, index) => {
        // Parse the time string correctly to preserve the timezone
        const startTime = new Date(slot.time);
        const endTime = new Date(slot.end_time);
        
        // Use the practice timezone for formatting display times
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

        // Get provider details from lookup map using NexHealth Provider ID
        const providerInfo = providerLookup.get(slot.provider_id.toString()) || { 
          id: undefined, // No Laine Provider CUID found
          savedProviderId: undefined, // No Laine SavedProvider CUID found
          nexhealthProviderId: slot.provider_id.toString(),
          name: `Provider ${slot.provider_id}` 
        };
        
        // Get operatory details from lookup map using NexHealth Operatory ID (if operatory_id exists)
        const operatoryInfo = slot.operatory_id ? 
          operatoryLookup.get(slot.operatory_id.toString()) || { 
            id: undefined, // No Laine SavedOperatory CUID found
            nexhealthOperatoryId: slot.operatory_id.toString(),
            name: `Operatory ${slot.operatory_id}` 
          } : null;
        
        return {
          slot_id: `slot_${index}`,
          time: slot.time, // Raw ISO string from NexHealth
          end_time: slot.end_time, // Raw ISO string from NexHealth
          display_time: timeString, // Formatted using practice timezone
          display_end_time: endTimeString, // Formatted using practice timezone
          display_range: `${timeString} - ${endTimeString}`, // Formatted range
          operatory_id: slot.operatory_id, // Raw NexHealth operatory ID
          provider_id: slot.provider_id, // Raw NexHealth provider ID
          location_id: slot.location_id, // Raw NexHealth location ID
          provider_info: providerInfo, // Enriched with Laine details
          operatory_info: operatoryInfo // Enriched with Laine details (if applicable)
        };
      });

      // Sort slots chronologically by time
      formattedSlots.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      console.log("  - Total formatted and enriched slots:", formattedSlots.length);

      const friendlyDate = formatDate(args.requestedDate);

      // Update ConversationState
      console.log("\n📝 CONVERSATION STATE UPDATE");
      console.log("============================");
      
      conversationState.updateRequestedDate(args.requestedDate);
      conversationState.updateAvailableSlotsForDate(formattedSlots);
      
      console.log("✅ ConversationState updated:");
      console.log("  - requestedDate:", args.requestedDate);
      console.log("  - availableSlotsForDate count:", formattedSlots.length);

      // Construct ToolResult.data with comprehensive information
      console.log("📊 Constructing final result:");
      
      if (formattedSlots.length === 0) {
        console.log("ℹ️ No slots available - returning no availability result");
        return {
          success: true,
          message_to_patient: "",
          data: {
            requested_date: args.requestedDate,
            requested_date_friendly: friendlyDate,
            appointment_type_name: appointmentTypeNameForMessages,
            available_slots: [],
            has_availability: false,
            total_slots_found: 0,
            slots_offered: 0,
            offered_time_list_string_for_message_suggestion: "",
            has_more_slots_beyond_offered: false,
            debug_info: {
              slot_length_used: slotLength,
              raw_slots_before_lunch_filter: rawSlots.length,
              slots_after_lunch_filter: filteredSlots.length,
              lunch_break_slots_filtered: rawSlots.length - filteredSlots.length,
              providers_checked: eligibleSavedProviders.length,
              operatories_checked: finalEligibleOperatories.length,
              nexhealth_provider_ids_used: nexhealthProviderIdsForAPI,
              nexhealth_operatory_ids_used: nexhealthOperatoryIdsForAPI,
              practice_timezone_used: practiceTimezone
            }
          }
        };
      }

      // Determine number of slots to initially suggest (e.g., 3 or 4 for voice interface)
      const slotsToOfferCount = Math.min(formattedSlots.length, 3);
      
      // Create unique display times for the offered slots
      const offeredTimeList = [...new Set(
        formattedSlots.slice(0, slotsToOfferCount).map(slot => slot.display_time)
      )];
      
      // Format offered time list string for message suggestion
      let timeOptionsMessage = "";
      if (offeredTimeList.length === 1) {
        timeOptionsMessage = offeredTimeList[0];
      } else if (offeredTimeList.length > 1) {
        timeOptionsMessage = offeredTimeList.slice(0, -1).join(', ') + 
          (offeredTimeList.length > 1 ? ', or ' : '') + 
          offeredTimeList[offeredTimeList.length - 1];
      }

      console.log("✅ Final result summary:");
      console.log("  - Total formatted slots:", formattedSlots.length);
      console.log("  - Slots to offer initially:", slotsToOfferCount);
      console.log("  - Offered time options:", timeOptionsMessage);
      console.log("=== CHECK AVAILABLE SLOTS - COMPLETED ===");

      return {
        success: true,
        message_to_patient: "",
        data: {
          requested_date: args.requestedDate,
          requested_date_friendly: friendlyDate,
          appointment_type_name: appointmentTypeNameForMessages,
          available_slots: formattedSlots,
          has_availability: true,
          total_slots_found: formattedSlots.length,
          slots_offered: slotsToOfferCount,
          offered_time_list_string_for_message_suggestion: timeOptionsMessage,
          has_more_slots_beyond_offered: formattedSlots.length > slotsToOfferCount,
          debug_info: {
            slot_length_used: slotLength,
            raw_slots_before_lunch_filter: rawSlots.length,
            slots_after_lunch_filter: filteredSlots.length,
            lunch_break_slots_filtered: rawSlots.length - filteredSlots.length,
            providers_checked: eligibleSavedProviders.length,
            operatories_checked: finalEligibleOperatories.length,
            nexhealth_provider_ids_used: nexhealthProviderIdsForAPI,
            nexhealth_operatory_ids_used: nexhealthOperatoryIdsForAPI,
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