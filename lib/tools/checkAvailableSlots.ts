import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";

// Add date normalization function to handle voice input
function normalizeDateFromVoice(dateString: string): string {
  // Handle cases like "December 20 third 20 25" -> "2025-12-23"
  // Handle cases like "December twenty third" -> current year + "12-23"
  
  const currentYear = new Date().getFullYear();
  
  // Pattern for "Month Day third Year" format
  const ordinalPattern = /(\w+)\s+(\d+)\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty[- ]?first|twenty[- ]?second|twenty[- ]?third|twenty[- ]?fourth|twenty[- ]?fifth|twenty[- ]?sixth|twenty[- ]?seventh|twenty[- ]?eighth|twenty[- ]?ninth|thirtieth|thirty[- ]?first)\s+(\d{2,4})/i;
  
  const match = dateString.match(ordinalPattern);
  if (match) {
    const [, month, baseDay, ordinal, year] = match;
    
    // Convert ordinal to number
    const ordinalMap: { [key: string]: number } = {
      'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
      'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10,
      'eleventh': 11, 'twelfth': 12, 'thirteenth': 13, 'fourteenth': 14, 'fifteenth': 15,
      'sixteenth': 16, 'seventeenth': 17, 'eighteenth': 18, 'nineteenth': 19, 'twentieth': 20,
      'twenty first': 21, 'twenty-first': 21, 'twenty second': 22, 'twenty-second': 22,
      'twenty third': 23, 'twenty-third': 23, 'twenty fourth': 24, 'twenty-fourth': 24,
      'twenty fifth': 25, 'twenty-fifth': 25, 'twenty sixth': 26, 'twenty-sixth': 26,
      'twenty seventh': 27, 'twenty-seventh': 27, 'twenty eighth': 28, 'twenty-eighth': 28,
      'twenty ninth': 29, 'twenty-ninth': 29, 'thirtieth': 30, 'thirty first': 31, 'thirty-first': 31
    };
    
    const day = ordinalMap[ordinal.toLowerCase().replace('-', ' ')] || parseInt(baseDay);
    const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
    
    // Convert month name to number
    const monthMap: { [key: string]: number } = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };
    
    const monthNum = monthMap[month.toLowerCase()];
    if (monthNum && day >= 1 && day <= 31) {
      return `${fullYear}-${monthNum.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }
  
  // Pattern for "Month twenty third" without year (assume current year)
  const ordinalNoYearPattern = /(\w+)\s+(twenty[- ]?first|twenty[- ]?second|twenty[- ]?third|twenty[- ]?fourth|twenty[- ]?fifth|twenty[- ]?sixth|twenty[- ]?seventh|twenty[- ]?eighth|twenty[- ]?ninth|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|thirty[- ]?first)/i;
  
  const matchNoYear = dateString.match(ordinalNoYearPattern);
  if (matchNoYear) {
    const [, month, ordinal] = matchNoYear;
    
    const ordinalMap: { [key: string]: number } = {
      'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
      'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10,
      'eleventh': 11, 'twelfth': 12, 'thirteenth': 13, 'fourteenth': 14, 'fifteenth': 15,
      'sixteenth': 16, 'seventeenth': 17, 'eighteenth': 18, 'nineteenth': 19, 'twentieth': 20,
      'twenty first': 21, 'twenty-first': 21, 'twenty second': 22, 'twenty-second': 22,
      'twenty third': 23, 'twenty-third': 23, 'twenty fourth': 24, 'twenty-fourth': 24,
      'twenty fifth': 25, 'twenty-fifth': 25, 'twenty sixth': 26, 'twenty-sixth': 26,
      'twenty seventh': 27, 'twenty-seventh': 27, 'twenty eighth': 28, 'twenty-eighth': 28,
      'twenty ninth': 29, 'twenty-ninth': 29, 'thirtieth': 30, 'thirty first': 31, 'thirty-first': 31
    };
    
    const day = ordinalMap[ordinal.toLowerCase().replace('-', ' ')];
    
    const monthMap: { [key: string]: number } = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };
    
    const monthNum = monthMap[month.toLowerCase()];
    if (monthNum && day && day >= 1 && day <= 31) {
      return `${currentYear}-${monthNum.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }
  
  // Return original if no match or try other parsing methods
  return dateString;
}

export const checkAvailableSlotsSchema = z.object({
  requestedDate: z.string()
    .min(1)
    .transform(normalizeDateFromVoice)
    .refine((date) => /^\d{4}-\d{2}-\d{2}$/.test(date), "Invalid date format")
    .describe("The date the patient wants to schedule for"),
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