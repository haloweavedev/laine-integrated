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
      // SUBPHASE 1: Correct Appointment Type and Duration Sourcing
      console.log("🎯 APPOINTMENT TYPE SOURCING");
      console.log("=============================");
      
      // CRUCIAL STEP A: Get appointment type from ConversationState first, then validate against args
      let appointmentTypeId = conversationState.determinedAppointmentTypeId;
      
      // If not in conversation state, use the one from args
      if (!appointmentTypeId) {
        appointmentTypeId = args.appointmentTypeId;
        console.log("⚠️ appointmentTypeId not found in ConversationState, using from args");
      } else {
        console.log("✅ Using appointmentTypeId from ConversationState:", appointmentTypeId);
      }
      
      // Verify they match if both are present, prioritize ConversationState
      if (conversationState.determinedAppointmentTypeId && 
          conversationState.determinedAppointmentTypeId !== args.appointmentTypeId) {
        console.log("⚠️ appointmentTypeId mismatch between ConversationState and args, prioritizing ConversationState");
        console.log("  - ConversationState:", conversationState.determinedAppointmentTypeId);
        console.log("  - Args:", args.appointmentTypeId);
        appointmentTypeId = conversationState.determinedAppointmentTypeId;
      }

      // Find the AppointmentType record using Laine CUID
      const appointmentType = practice.appointmentTypes?.find(
        at => at.id === appointmentTypeId
      );

      if (!appointmentType) {
        console.log("❌ AppointmentType not found for Laine CUID:", appointmentTypeId);
        // Try with args.appointmentTypeId as fallback
        if (appointmentTypeId !== args.appointmentTypeId) {
          console.log("🔄 Fallback: Trying with args.appointmentTypeId:", args.appointmentTypeId);
          const fallbackAppointmentType = practice.appointmentTypes?.find(
            at => at.id === args.appointmentTypeId
          );
          if (fallbackAppointmentType) {
            console.log("✅ Found AppointmentType using fallback args.appointmentTypeId");
            appointmentTypeId = args.appointmentTypeId;
          } else {
            return {
              success: false,
              error_code: "INVALID_APPOINTMENT_TYPE",
              message_to_patient: "",
              details: "Appointment type not found or doesn't belong to practice"
            };
          }
        } else {
          return {
            success: false,
            error_code: "INVALID_APPOINTMENT_TYPE",
            message_to_patient: "",
            details: "Appointment type not found or doesn't belong to practice"
          };
        }
      }

      // Re-fetch appointmentType after potential fallback
      const finalAppointmentType = practice.appointmentTypes?.find(
        at => at.id === appointmentTypeId
      );

      if (!finalAppointmentType) {
        return {
          success: false,
          error_code: "INVALID_APPOINTMENT_TYPE",
          message_to_patient: "",
          details: "Appointment type not found or doesn't belong to practice"
        };
      }

      // CRITICALLY, use determinedDurationMinutes from ConversationState as primary source
      let slotLength: number;
      let durationSource: string;
      
      if (conversationState.determinedDurationMinutes !== null && conversationState.determinedDurationMinutes > 0) {
        slotLength = conversationState.determinedDurationMinutes;
        durationSource = "ConversationState.determinedDurationMinutes";
      } else {
        slotLength = finalAppointmentType.duration;
        durationSource = "AppointmentType.duration (fallback)";
      }
      
      console.log("✅ Found AppointmentType:");
      console.log("  - Laine CUID:", finalAppointmentType.id);
      console.log("  - Name:", finalAppointmentType.name);
      console.log("  - NexHealth ID:", finalAppointmentType.nexhealthAppointmentTypeId);
      console.log("  - Duration source:", durationSource);
      console.log("  - Duration (for slot_length):", slotLength, "minutes");

      // SUBPHASE 2: Accurate Provider Filtering Logic
      console.log("👨‍⚕️ PROVIDER FILTERING");
      console.log("====================");
      
      // Filter practice.savedProviders to include only those where isActive is true
      const activeSavedProviders = practice.savedProviders.filter(sp => sp.isActive);
      console.log("📋 Provider filtering - Step 1 (Active filter):");
      console.log("  - Total SavedProviders in practice:", practice.savedProviders.length);
      console.log("  - Active SavedProviders:", activeSavedProviders.length);
      
      // Further filter based on acceptedAppointmentTypes
      let eligibleSavedProviders = activeSavedProviders.filter(sp => {
        // If provider has no accepted appointment types configured, include them (backward compatibility)
        if (!sp.acceptedAppointmentTypes || sp.acceptedAppointmentTypes.length === 0) {
          console.log(`  - Provider ${sp.provider.firstName} ${sp.provider.lastName}: accepts all (no restrictions)`);
          return true;
        }
        
        // Otherwise, check if they accept this specific appointment type using Laine CUID
        const acceptsType = sp.acceptedAppointmentTypes.some(
          relation => relation.appointmentType.id === finalAppointmentType.id
        );
        console.log(`  - Provider ${sp.provider.firstName} ${sp.provider.lastName}: accepts this type = ${acceptsType} (${sp.acceptedAppointmentTypes.length} restrictions)`);
        return acceptsType;
      });

      console.log("📋 Provider filtering - Step 2 (Appointment type acceptance):");
      console.log("  - SavedProviders accepting this AppointmentType:", eligibleSavedProviders.length);

      // Apply optional provider filter (if args.providerIds are provided)
      if (args.providerIds && args.providerIds.length > 0) {
        const beforeFilterCount = eligibleSavedProviders.length;
        eligibleSavedProviders = eligibleSavedProviders.filter(sp => 
          args.providerIds!.includes(sp.id) // sp.id is the Laine CUID of SavedProvider
        );
        console.log("📋 Provider filtering - Step 3 (Optional provider ID filter):");
        console.log("  - Before provider ID filter:", beforeFilterCount);
        console.log("  - After provider ID filter:", eligibleSavedProviders.length);
        console.log("  - Provider IDs requested:", args.providerIds);
        console.log("  - Matched SavedProvider IDs:", eligibleSavedProviders.map(sp => sp.id));
      }

      if (eligibleSavedProviders.length === 0) {
        console.log("❌ No providers match the criteria");
        return {
          success: false,
          error_code: "NO_PROVIDERS_FOR_TYPE",
          message_to_patient: "",
          data: {
            appointment_type_name: finalAppointmentType.name
          }
        };
      }

      // Collect the unique nexhealthProviderId values for NexHealth API
      const nexhealthProviderIds = [...new Set(
        eligibleSavedProviders.map(sp => sp.provider.nexhealthProviderId)
      )];

      console.log("🔗 NexHealth Provider IDs extracted:", nexhealthProviderIds);
      console.log("📋 Eligible provider details:");
      eligibleSavedProviders.forEach(sp => {
        console.log(`  - ${sp.provider.firstName || ''} ${sp.provider.lastName || ''}`.trim());
        console.log(`    SavedProvider ID: ${sp.id}`);
        console.log(`    Provider ID: ${sp.provider.id}`);
        console.log(`    NexHealth Provider ID: ${sp.provider.nexhealthProviderId}`);
        console.log(`    Accepted appointment types: ${sp.acceptedAppointmentTypes?.length || 0}`);
             });

      // SUBPHASE 3: Accurate Operatory Derivation and Filtering Logic
      console.log("\n🏥 OPERATORY DERIVATION");
      console.log("=======================");
      
      // Initialize empty array for eligible operatories
      const eligibleOperatories: Array<{
        id: string;
        nexhealthOperatoryId: string;
        name: string;
      }> = [];

      // Iterate through eligible providers to collect their assigned operatories
      for (const savedProvider of eligibleSavedProviders) {
        console.log(`🔍 Checking operatories for provider: ${savedProvider.provider.firstName} ${savedProvider.provider.lastName}`);
        // Get operatories assigned to this provider via the assignedOperatories relation
        const assignedOperatories = savedProvider.assignedOperatories?.map(assignment => assignment.savedOperatory) || [];
        console.log(`  - Assigned operatories: ${assignedOperatories.length}`);
        assignedOperatories.forEach(op => {
          console.log(`    • ${op.name} (Laine ID: ${op.id}, NexHealth ID: ${op.nexhealthOperatoryId})`);
        });
        eligibleOperatories.push(...assignedOperatories);
      }

      // Remove duplicate SavedOperatory records (using Set based on id)
      const uniqueOperatoriesMap = new Map();
      eligibleOperatories.forEach(operatory => {
        uniqueOperatoriesMap.set(operatory.id, operatory);
      });
      const uniqueOperatories = Array.from(uniqueOperatoriesMap.values());

      console.log("🏢 Operatory derivation - Step 1 (From eligible providers):");
      console.log("  - Operatories derived from eligible providers:", eligibleOperatories.length);
      console.log("  - Unique operatories after deduplication:", uniqueOperatories.length);

      // Apply optional operatory filter (if args.operatoryIds are provided)
      let finalOperatories = uniqueOperatories;
      if (args.operatoryIds && args.operatoryIds.length > 0) {
        const beforeFilterCount = finalOperatories.length;
        finalOperatories = uniqueOperatories.filter(operatory => 
          args.operatoryIds!.includes(operatory.id) // operatory.id is the Laine CUID of SavedOperatory
        );
        console.log("🏢 Operatory derivation - Step 2 (Optional operatory ID filter):");
        console.log("  - Before operatory ID filter:", beforeFilterCount);
        console.log("  - After operatory ID filter:", finalOperatories.length);
        console.log("  - Operatory IDs requested:", args.operatoryIds);
        console.log("  - Matched SavedOperatory IDs:", finalOperatories.map(op => op.id));
      }

      // Extract nexhealthOperatoryIds for the API call
      const nexhealthOperatoryIds = finalOperatories.map(operatory => operatory.nexhealthOperatoryId);

      console.log("🔗 NexHealth Operatory IDs extracted:", nexhealthOperatoryIds);
      console.log("📋 Final operatory details:");
      finalOperatories.forEach(op => {
        console.log(`  - ${op.name} (Laine ID: ${op.id}, NexHealth ID: ${op.nexhealthOperatoryId})`);
             });

      // SUBPHASE 4: Practice Timezone Usage for Lunch Break and Display Formatting
      console.log("\n⏰ PRACTICE TIMEZONE SETUP");
      console.log("==========================");
      
      // Retrieve practiceTimezone from context.practice.timezone with fallback
      const practiceTimezone = practice.timezone || 'America/Chicago';
      if (practice.timezone) {
        console.log("✅ Using practice timezone:", practice.timezone);
      } else {
        console.log("⚠️ Using default timezone (America/Chicago) for slot processing. Consider setting practice.timezone in practice configuration for accuracy.");
      }

      // SUBPHASE 5: Construct Correct NexHealth API Parameters
      console.log("\n🚀 NEXHEALTH API CALL PARAMETERS");
      console.log("=================================");
      
      // Build NexHealth API parameters precisely per NexHealth requirements
      const params: Record<string, string | number | string[]> = {
        start_date: args.requestedDate,
        days: args.days, // Ensure it's a number
        'lids[]': [practice.nexhealthLocationId],
        'pids[]': nexhealthProviderIds,
        slot_length: slotLength, // CRITICAL: Use duration from ConversationState or AppointmentType fallback
        overlapping_operatory_slots: 'false' // CRITICAL: Must be string 'false'
      };

      // CRITICAL: Only add operatory_ids[] if the array is not empty
      if (nexhealthOperatoryIds.length > 0) {
        params['operatory_ids[]'] = nexhealthOperatoryIds;
        console.log("✅ Including operatory filter with", nexhealthOperatoryIds.length, "operatories");
      } else {
        console.log("ℹ️ No operatory filter - querying across all available operatories for providers");
      }

      // CRITICAL: Explicitly DO NOT include appointment_type_id in these parameters
      console.log("📋 Final API parameters:");
      console.log("  - Endpoint: /appointment_slots");
      console.log("  - Subdomain:", practice.nexhealthSubdomain);
      console.log("  - Params:", JSON.stringify(params, null, 2));
      console.log("  ✅ IMPORTANT: slot_length =", slotLength, "(from " + (conversationState.determinedDurationMinutes ? "ConversationState" : "AppointmentType") + ")");
      console.log("  ✅ IMPORTANT: overlapping_operatory_slots = 'false'");
      console.log("  ✅ IMPORTANT: NO appointment_type_id parameter sent to NexHealth (as required)");

      // Call NexHealth API
      const slotsResponse = await fetchNexhealthAPI(
        '/appointment_slots',
        practice.nexhealthSubdomain,
        params
      );

      console.log("📡 NexHealth API Response received");

      // SUBPHASE 6: Refine Slot Processing, Formatting, and Return Object
      console.log("\n📊 SLOT PROCESSING & FORMATTING");
      console.log("===============================");
      
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

      console.log("📊 Raw slot parsing:");
      console.log("  - Raw slots from NexHealth API:", rawSlots.length);

      // Lunch Break Filtering using practice timezone
      const filteredSlots = rawSlots.filter(slot => !isLunchBreakSlot(slot.time, practiceTimezone));

      console.log("📊 Lunch break filtering:");
      console.log("  - Slots after lunch break filtering:", filteredSlots.length);
      console.log("  - Lunch break slots filtered out:", rawSlots.length - filteredSlots.length);
      console.log("  - Practice timezone used for filtering:", practiceTimezone);

      // Provider & Operatory Lookup Maps for enriching slot data
      console.log("📊 Creating lookup maps:");
      
      // Provider lookup map (NexHealth Provider ID -> Laine Provider details)
      const providerLookup = new Map();
      eligibleSavedProviders.forEach(sp => {
        providerLookup.set(sp.provider.nexhealthProviderId, {
          id: sp.provider.id, // Laine Provider CUID
          nexhealthProviderId: sp.provider.nexhealthProviderId,
          name: `${sp.provider.firstName || ''} ${sp.provider.lastName || ''}`.trim()
        });
      });
      console.log("  - Provider lookup map entries:", providerLookup.size);

      // Operatory lookup map (NexHealth Operatory ID -> Laine SavedOperatory details)
      const operatoryLookup = new Map();
      finalOperatories.forEach(operatory => {
        operatoryLookup.set(operatory.nexhealthOperatoryId, {
          id: operatory.id, // Laine SavedOperatory CUID
          nexhealthOperatoryId: operatory.nexhealthOperatoryId,
          name: operatory.name
        });
      });
      console.log("  - Operatory lookup map entries:", operatoryLookup.size);

      // Format Slots with Laine-specific enrichment and practice timezone formatting
      console.log("📊 Formatting slots:");
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

        // Get provider details from lookup map
        const providerInfo = providerLookup.get(slot.provider_id.toString()) || { 
          id: undefined, // No Laine Provider CUID found
          nexhealthProviderId: slot.provider_id.toString(),
          name: `Provider ${slot.provider_id}` 
        };
        
        // Get operatory details from lookup map (if operatory_id exists)
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
      console.log("  - Total formatted slots:", formattedSlots.length);

      const appointmentTypeName = finalAppointmentType.name;
      const friendlyDate = formatDate(args.requestedDate);

      // SUBPHASE 7: Update ConversationState and Final Review
      console.log("\n📝 CONVERSATION STATE UPDATE");
      console.log("============================");
      
      // After successfully processing slots, update ConversationState
      conversationState.updateRequestedDate(args.requestedDate);
      conversationState.updateAvailableSlotsForDate(formattedSlots); // Will be empty array if no slots found
      
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
            appointment_type_name: appointmentTypeName,
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
              operatories_checked: finalOperatories.length,
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
          appointment_type_name: appointmentTypeName,
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