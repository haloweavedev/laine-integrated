import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

export const findAppointmentTypeSchema = z.object({
  userRequest: z.string().min(1).describe("The patient's description of what they want to come in for (e.g., 'cleanup', 'checkup', 'consultation', 'filling')")
});

const findAppointmentTypeTool: ToolDefinition<typeof findAppointmentTypeSchema> = {
  name: "find_appointment_type",
  description: "Matches the patient's request for service to available appointment types in the practice. Use this after confirming patient identity to determine what type of appointment they need.",
  schema: findAppointmentTypeSchema,
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice } = context;
    
    if (!practice.appointmentTypes || practice.appointmentTypes.length === 0) {
      return {
        success: false,
        error_code: "NO_APPOINTMENT_TYPES",
        message_to_patient: "I don't have any appointment types configured for this practice. Please contact the office directly to schedule."
      };
    }

    try {
      const userRequest = args.userRequest.toLowerCase().trim();
      
      // Create searchable appointment type list
      const availableTypes = practice.appointmentTypes.map(type => ({
        id: type.nexhealthAppointmentTypeId,
        name: type.name,
        duration: type.duration,
        searchTerms: type.name.toLowerCase()
      }));

      console.log(`[findAppointmentType] Looking for "${userRequest}" in types:`, availableTypes.map(t => t.name));

      // Simple matching algorithm - can be enhanced with fuzzy matching
      let bestMatch = null;
      let bestScore = 0;

      for (const type of availableTypes) {
        let score = 0;
        
        // Exact match gets highest score
        if (type.searchTerms.includes(userRequest)) {
          score = 100;
        }
        // Partial word matches
        else {
          const requestWords = userRequest.split(' ');
          const typeWords = type.searchTerms.split(' ');
          
          for (const requestWord of requestWords) {
            for (const typeWord of typeWords) {
              if (typeWord.includes(requestWord) || requestWord.includes(typeWord)) {
                score += 10;
              }
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = type;
        }
      }

      if (!bestMatch || bestScore < 5) {
        // No good match found - present options
        const typeOptions = availableTypes
          .map(type => `${type.name} (${type.duration} minutes)`)
          .join(', ');
          
        return {
          success: true,
          message_to_patient: `I'm not sure which appointment type matches "${args.userRequest}". We have these options available: ${typeOptions}. Which one would you like?`,
          data: {
            matched: false,
            available_types: availableTypes,
            user_request: userRequest
          }
        };
      }

      // Good match found - confirm with user
      return {
        success: true,
        message_to_patient: `Perfect! I can schedule you for a ${bestMatch.name} which takes ${bestMatch.duration} minutes. When would you like to come in?`,
        data: {
          matched: true,
          appointment_type_id: bestMatch.id,
          appointment_type_name: bestMatch.name,
          duration_minutes: bestMatch.duration,
          user_request: userRequest
        }
      };

    } catch (error) {
      console.error(`[findAppointmentType] Error:`, error);
      
      return {
        success: false,
        error_code: "APPOINTMENT_TYPE_SEARCH_ERROR",
        message_to_patient: "I had trouble finding appointment types. Please tell me specifically what type of appointment you need.",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me find the right appointment type for you...",
    success: "Great! I can help you schedule that appointment.",
    fail: "Let me check what appointment types we have available."
  }
};

export default findAppointmentTypeTool; 