import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

export const findAppointmentTypeSchema = z.object({
  userRequest: z.string()
    .min(1)
    .describe(`Patient's requested service type. Common variations: cleaning/hygiene/prophy, checkup/exam, emergency/pain, filling/cavity, crown/cap, root canal, extraction/pull tooth. Example: "I need a cleaning" → "cleaning"`)
});

const findAppointmentTypeTool: ToolDefinition<typeof findAppointmentTypeSchema> = {
  name: "find_appointment_type",
  description: `
    Matches the patient's requested service to available appointment types and returns the corresponding appointment type details.
    WHEN TO USE: Call this tool when a patient mentions what type of service or appointment they need (e.g., "cleaning", "checkup", "filling").
    REQUIRED INPUTS: 'userRequest' (patient's description of the service they want).
    OUTPUTS: On success, returns 'appointment_type_id', 'appointment_type_name', 'duration_minutes', and 'matched' boolean. On no match, returns available options.
    SEQUENCE NOTE: This tool should typically be called BEFORE 'check_available_slots' to obtain the required 'appointmentTypeId'. The output provides essential data for subsequent booking steps.
    IMPORTANT: The returned 'appointment_type_id' and 'duration_minutes' are required for both 'check_available_slots' and 'book_appointment'.
  `.trim(),
  schema: findAppointmentTypeSchema,
  prerequisites: [
    {
      argName: 'userRequest',
      askUserMessage: "Sure, I can help with that! What kind of service or reason for visit did you have in mind?"
    }
  ],
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice } = context;
    
    if (!practice.appointmentTypes || practice.appointmentTypes.length === 0) {
      return {
        success: false,
        error_code: "NO_APPOINTMENT_TYPES",
        message_to_patient: "", // Will be filled by dynamic generation
        details: "No appointment types configured"
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
          .map(type => type.name);
          
        return {
          success: true,
          message_to_patient: "", // Will be filled by dynamic generation
          data: {
            matched: false,
            available_types: availableTypes.map(t => ({
              id: t.id,
              name: t.name,
              duration: t.duration
            })),
            available_types_list: typeOptions,
            user_request: userRequest,
            total_types_available: availableTypes.length
          }
        };
      }

      // Good match found - persist to CallLog and return
      // TODO: Implement CallLog persistence for lastAppointmentTypeId after Prisma type resolution
      console.log(`[findAppointmentType] Found appointment type: ${bestMatch.id} (${bestMatch.name})`);
      // Note: Schema has been updated with lastAppointmentTypeId, lastAppointmentTypeName, lastAppointmentDuration fields

      return {
        success: true,
        message_to_patient: "", // Will be filled by dynamic generation
        data: {
          matched: true,
          appointment_type_id: bestMatch.id,
          appointment_type_name: bestMatch.name,
          duration_minutes: bestMatch.duration,
          user_request: userRequest,
          match_score: bestScore
        }
      };

    } catch (error) {
      console.error(`[findAppointmentType] Error:`, error);
      
      let errorCode = "APPOINTMENT_TYPE_SEARCH_ERROR";
      
      if (error instanceof Error) {
        if (error.message.includes("400") || error.message.includes("validation")) {
          errorCode = "NEXHEALTH_VALIDATION_ERROR";
        } else if (error.message.includes("401")) {
          errorCode = "NEXHEALTH_AUTH_ERROR";
        } else if (error.message.includes("nexhealth") || error.message.includes("api")) {
          errorCode = "NEXHEALTH_API_ERROR";
        }
      }
      
      return {
        success: false,
        error_code: errorCode,
        message_to_patient: "", // Will be filled by dynamic generation
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
};

export default findAppointmentTypeTool; 