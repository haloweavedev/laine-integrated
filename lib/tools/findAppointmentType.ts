import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

export const findAppointmentTypeSchema = z.object({
  userRequest: z.string()
    .min(1)
    .describe(`Patient's requested service type. Common variations: cleaning/hygiene/prophy, checkup/exam, emergency/pain, filling/cavity, crown/cap, root canal, extraction/pull tooth. Example: "I need a cleaning" → "cleaning"`)
});

const findAppointmentTypeTool: ToolDefinition<typeof findAppointmentTypeSchema> = {
  name: "find_appointment_type",
  description: "Matches patient's service request to available appointment types. Use after confirming patient identity when they mention what type of appointment they need (cleaning, checkup, filling, etc.).",
  schema: findAppointmentTypeSchema,
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice } = context;
    
    if (!practice.appointmentTypes || practice.appointmentTypes.length === 0) {
      return {
        success: false,
        error_code: "NO_APPOINTMENT_TYPES",
        message_to_patient: "I don't have any appointment types configured for this practice. Please contact the office directly to schedule your appointment."
      };
    }

    try {
      const userRequest = args.userRequest.toLowerCase().trim();
      
      // Create searchable appointment type list with common aliases
      const appointmentTypeAliases: Record<string, string[]> = {
        'cleaning': ['clean', 'hygiene', 'prophy', 'prophylaxis', 'dental cleaning', 'teeth cleaning'],
        'checkup': ['check', 'exam', 'examination', 'visit', 'routine'],
        'consultation': ['consult', 'new patient', 'initial'],
        'filling': ['cavity', 'restoration', 'tooth repair'],
        'crown': ['cap', 'tooth cap'],
        'root canal': ['endodontic', 'nerve', 'tooth infection'],
        'extraction': ['pull', 'remove', 'tooth removal'],
        'emergency': ['urgent', 'pain', 'broken', 'asap']
      };

      const availableTypes = practice.appointmentTypes.map(type => ({
        id: type.nexhealthAppointmentTypeId,
        name: type.name,
        duration: type.duration,
        searchTerms: type.name.toLowerCase(),
        aliases: [] as string[]
      }));

      // Add aliases to available types
      availableTypes.forEach(type => {
        Object.entries(appointmentTypeAliases).forEach(([key, aliases]) => {
          if (type.searchTerms.includes(key)) {
            type.aliases = aliases;
          }
        });
      });

      console.log(`[findAppointmentType] Looking for "${userRequest}" in types:`, availableTypes.map(t => t.name));

      // Enhanced matching algorithm
      let bestMatch = null;
      let bestScore = 0;

      for (const type of availableTypes) {
        let score = 0;
        
        // Exact match gets highest score
        if (type.searchTerms === userRequest) {
          score = 100;
        }
        // Check aliases
        else if (type.aliases.some(alias => userRequest.includes(alias))) {
          score = 80;
        }
        // Check if type name is in request
        else if (userRequest.includes(type.searchTerms)) {
          score = 70;
        }
        // Partial word matches
        else {
          const requestWords = userRequest.split(' ');
          const typeWords = type.searchTerms.split(' ');
          
          for (const requestWord of requestWords) {
            for (const typeWord of typeWords) {
              if (typeWord.includes(requestWord) || requestWord.includes(typeWord)) {
                score += 20;
              }
            }
            // Check aliases too
            for (const alias of type.aliases) {
              if (alias.includes(requestWord) || requestWord.includes(alias)) {
                score += 15;
              }
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = type;
        }
      }

      if (!bestMatch || bestScore < 10) {
        // No good match found - present options conversationally
        const typeOptions = availableTypes
          .slice(0, 5) // Limit to 5 options for voice
          .map(type => type.name)
          .join(', ');
          
        return {
          success: true,
          message_to_patient: `I want to make sure I schedule the right appointment for you. We offer ${typeOptions}. Which of these sounds like what you need?`,
          data: {
            matched: false,
            available_types: availableTypes.map(t => ({
              id: t.id,
              name: t.name,
              duration: t.duration
            })),
            user_request: userRequest
          }
        };
      }

      // Good match found - confirm and move forward
      return {
        success: true,
        message_to_patient: `Perfect! I can schedule you for a ${bestMatch.name} which takes ${bestMatch.duration} minutes. What day would work best for you?`,
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
        message_to_patient: "I had trouble understanding what type of appointment you need. Could you tell me again what you'd like to come in for?",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me find the right appointment type for you...",
    success: "Okay, appointment type search processed.",
    fail: "There was an issue with the appointment type search."
  }
};

export default findAppointmentTypeTool; 