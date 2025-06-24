import { ConversationState, NexHealthSlot } from "@/lib/conversationState";
import { ParsedCheckAvailableSlotsArgs } from "@/lib/tools/checkAvailableSlots";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import { addLogEntry } from "@/lib/debugLogStore";
import { parseISO, format, getHours, parse } from 'date-fns'; // For date manipulation

interface PracticeInfoForSlotChecking {
    id: string;
    nexhealthSubdomain: string;
    nexhealthLocationId: string; // This is the 'lids[]' parameter
    // practiceLocalTimeZone: string; // e.g., 'America/New_York' - for accurate lunch break filtering
}

export interface SlotCheckerResult {
  success: boolean;
  outputData: {
    messageForAssistant?: string; // To be populated by messageGenerator
    requestedDateFormatted: string; // e.g., "Tuesday, July 15th"
    slotsFound: boolean;
    presentedSlots?: string[]; // e.g., ["9:00 AM", "10:30 AM", "2:00 PM"]
    availableSlotsCount?: number; // Total count after filtering
    // Add any other data needed by message generator
  };
  error?: string;
}

// Helper to attempt parsing various date inputs to YYYY-MM-DD
// This is a simplified version. Robust date parsing from natural language is complex.
// VAPI's LLM should be prompted to provide YYYY-MM-DD if possible.
function normalizeDateToYYYYMMDD(dateString: string): string | null {
    const commonFormats = [
        "MM/dd/yyyy", "M/d/yyyy", "MM-dd-yyyy", "M-d-yyyy",
        "yyyy-MM-dd", // ISO
        "MMMM d, yyyy", "MMM d, yyyy",
    ];
    // Handle "tomorrow", "today"
    if (dateString.toLowerCase() === "tomorrow") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return format(tomorrow, "yyyy-MM-dd");
    }
    if (dateString.toLowerCase() === "today") {
        return format(new Date(), "yyyy-MM-dd");
    }

    for (const fmt of commonFormats) {
        try {
            const parsedDate = parse(dateString, fmt, new Date());
            if (!isNaN(parsedDate.getTime())) {
                return format(parsedDate, "yyyy-MM-dd");
            }
        } catch { /* ignore parse error, try next format */ }
    }
    // Try direct ISO parsing as a last resort
    try {
        const parsedDate = parseISO(dateString);
         if (!isNaN(parsedDate.getTime())) {
            return format(parsedDate, "yyyy-MM-dd");
        }
    } catch { /* ignore */ }

    return null; // Could not parse
}

// Simple lunch break filter (assumes times are in practice's local time)
// Example: 1 PM (13:00) to 2 PM (14:00)
const LUNCH_BREAK_START_HOUR = 13;
const LUNCH_BREAK_END_HOUR = 14;

function isSlotDuringLunch(slotTimeISO: string): boolean {
    try {
        const slotDate = parseISO(slotTimeISO); // NexHealth provides ISO strings
        const hour = getHours(slotDate);
        return hour >= LUNCH_BREAK_START_HOUR && hour < LUNCH_BREAK_END_HOUR;
    } catch (e) {
        console.error("Error parsing slot time for lunch break check:", e);
        return false; // Don't filter if unsure
    }
}


export async function processCheckAvailableSlots(
  args: ParsedCheckAvailableSlotsArgs,
  state: ConversationState,
  practiceInfo: PracticeInfoForSlotChecking,
  vapiCallId: string
): Promise<SlotCheckerResult> {
  addLogEntry({
    event: "AI_HANDLER_START",
    source: "slotCheckerHandler.processCheckAvailableSlots",
    details: { args, practiceId: practiceInfo.id, initialState: state.getStateSnapshot() }
  }, vapiCallId);

  const normalizedDate = normalizeDateToYYYYMMDD(args.requestedDate);
  if (!normalizedDate) {
    addLogEntry({ event: "AI_HANDLER_ERROR", source: "slotCheckerHandler", details: { error: "Invalid date format", requestedDate: args.requestedDate }}, vapiCallId);
    state.setCurrentStage("slot_check_invalid_date");
    return { success: false, outputData: { slotsFound: false, requestedDateFormatted: args.requestedDate }, error: "INVALID_DATE_FORMAT" };
  }
  state.setRequestedDate(normalizedDate);
  const timePref = args.timePreference?.toLowerCase();
  if (timePref === 'morning' || timePref === 'afternoon' || timePref === 'evening') {
    state.setRequestedTimePreference(timePref);
  } else {
    state.setRequestedTimePreference(null);
  }

  // Retrieve necessary info from state (populated by find_appointment_type)
  const { matchedNexhealthAppointmentTypeId, targetNexhealthProviderId, matchedAppointmentDuration } = state;
  if (!matchedNexhealthAppointmentTypeId || !targetNexhealthProviderId || !matchedAppointmentDuration) {
    addLogEntry({ event: "AI_HANDLER_ERROR", source: "slotCheckerHandler", details: { error: "Missing appointment/provider details in state." }}, vapiCallId);
    state.setCurrentStage("slot_check_missing_appt_details");
    return { success: false, outputData: { slotsFound: false, requestedDateFormatted: format(parseISO(normalizedDate + 'T00:00:00'), "EEEE, MMMM do") }, error: "MISSING_APPOINTMENT_DETAILS_IN_STATE" };
  }

  const params = {
    subdomain: practiceInfo.nexhealthSubdomain,
    start_date: normalizedDate,
    days: "1",
    "lids[]": practiceInfo.nexhealthLocationId,
    "pids[]": targetNexhealthProviderId, // This is an array in NexHealth API, but we have one
    slot_length: String(matchedAppointmentDuration),
    overlapping_operatory_slots: "false" // As per example
  };

  addLogEntry({ event: "NEXHEALTH_GET_SLOTS_START", source: "slotCheckerHandler", details: { params } }, vapiCallId);
  try {
    const response = await fetchNexhealthAPI(
      '/appointment_slots',
      practiceInfo.nexhealthSubdomain, // Subdomain also passed here for fetchNexhealthAPI internal logic
      params,
      'GET'
    );
    addLogEntry({ event: "NEXHEALTH_GET_SLOTS_RESPONSE", source: "slotCheckerHandler", details: { responseLength: response?.data?.length } }, vapiCallId);

    let allSlots: NexHealthSlot[] = [];
    if (response && response.data && Array.isArray(response.data) && response.data.length > 0) {
        // NexHealth returns an array of providers, each with a slots array.
        // We queried for one provider, so expect one entry in response.data.
        if (response.data[0] && Array.isArray(response.data[0].slots)) {
            allSlots = response.data[0].slots;
        }
    }
    
    const filteredSlots = allSlots.filter(slot => !isSlotDuringLunch(slot.time));
    
    // Further filter by timePreference if provided (simple version)
    let preferenceFilteredSlots = filteredSlots;
    if (state.requestedTimePreference) {
        preferenceFilteredSlots = filteredSlots.filter(slot => {
            const hour = getHours(parseISO(slot.time));
            if (state.requestedTimePreference === 'morning' && hour < 12 && hour >= LUNCH_BREAK_START_HOUR === false) return true; // Morning before 12 PM, not lunch
            if (state.requestedTimePreference === 'afternoon' && hour >= 12 && hour < 17 && hour < LUNCH_BREAK_START_HOUR && hour >= LUNCH_BREAK_END_HOUR === false) return true; // Afternoon 12 PM - 5 PM, not lunch
            if (state.requestedTimePreference === 'evening' && hour >= 17) return true; // Evening 5 PM onwards
            return false;
        });
        // If preference yields no slots, but there were slots before preference filter, revert to all non-lunch slots
        if (preferenceFilteredSlots.length === 0 && filteredSlots.length > 0) {
            preferenceFilteredSlots = filteredSlots; 
            // We can inform the user their preference had no slots, but here are others.
            // This logic can be in messageGenerator.
        }
    }


    state.setAvailableSlotsForDate(preferenceFilteredSlots); // Store all potentially valid slots
    const presentedSlotsDisplay: string[] = preferenceFilteredSlots
        .slice(0, 3) // Take first 3
        .map(slot => format(parseISO(slot.time), "h:mm a")); // Format like "9:00 AM"
    
    state.setPresentedSlots(presentedSlotsDisplay);

    state.setCurrentStage(preferenceFilteredSlots.length > 0 ? "slots_found" : "no_slots_found");
    addLogEntry({ event: "AI_HANDLER_STATE_UPDATED", source: "slotCheckerHandler", details: { finalState: state.getStateSnapshot(), rawSlotsCount: allSlots.length, filteredSlotsCount: preferenceFilteredSlots.length } }, vapiCallId);

    return {
      success: true,
      outputData: {
        requestedDateFormatted: format(parseISO(normalizedDate + 'T00:00:00'), "EEEE, MMMM do"),
        slotsFound: preferenceFilteredSlots.length > 0,
        presentedSlots: presentedSlotsDisplay,
        availableSlotsCount: preferenceFilteredSlots.length,
      },
    };

  } catch (apiError) {
    console.error("NexHealth /appointment_slots API call exception:", apiError);
    addLogEntry({ event: "NEXHEALTH_GET_SLOTS_EXCEPTION", source: "slotCheckerHandler", details: { error: apiError instanceof Error ? apiError.message : String(apiError) } }, vapiCallId);
    state.setCurrentStage("slot_check_api_error");
    return {
      success: false,
      outputData: {
        slotsFound: false,
        requestedDateFormatted: format(parseISO(normalizedDate + 'T00:00:00'), "EEEE, MMMM do"),
      },
      error: "NEXHEALTH_SLOT_API_EXCEPTION",
    };
  }
} 