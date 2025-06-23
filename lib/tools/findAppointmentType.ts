import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { matchAppointmentTypeWithLLM, MatcherAppointmentType } from "@/lib/ai/appointmentMatcher";

export const findAppointmentTypeSchema = z.object({
  userRequest: z.string()
    .min(1)
    .describe(`Patient's requested service type. Common variations: cleaning/hygiene/prophy, checkup/exam, emergency/pain, filling/cavity, crown/cap, root canal, extraction/pull tooth. Example: "I need a cleaning" → "cleaning"`)
});

const findAppointmentTypeTool: ToolDefinition<typeof findAppointmentTypeSchema> = {
  name: "find_appointment_type",
  description: `
    Uses AI to intelligently match the patient's requested service to available appointment types and returns the corresponding appointment type details.
    WHEN TO USE: Call this tool when a patient mentions what type of service or appointment they need (e.g., "cleaning", "checkup", "filling").
    REQUIRED INPUTS: 'userRequest' (patient's description of the service they want).
    OUTPUTS: On success, returns 'appointment_type_id' (Laine CUID), 'appointment_type_name', 'duration_minutes', 'nexhealth_appointment_type_id', and 'matched' boolean. On no match, returns available options.
    SEQUENCE NOTE: This tool should typically be called BEFORE 'check_available_slots' to obtain the required 'appointmentTypeId'. The output provides essential data for subsequent booking steps.
    IMPORTANT: The returned 'appointment_type_id' is the Laine CUID for internal tracking, while 'nexhealth_appointment_type_id' is required for 'check_available_slots' and 'book_appointment'.
    AI MATCHING: This tool uses advanced AI to match patient requests to appointment types considering names, keywords, and dental terminology.
  `.trim(),
  schema: findAppointmentTypeSchema,
  prerequisites: [
    {
      argName: 'userRequest',
      askUserMessage: "Sure, I can help with that! What kind of service or reason for visit did you have in mind?"
    }
  ],
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice, conversationState } = context;
    
    if (!practice.appointmentTypes || practice.appointmentTypes.length === 0) {
      return {
        success: false,
        error_code: "NO_APPOINTMENT_TYPES",
        message_to_patient: "", // Will be filled by dynamic generation
        details: "No appointment types configured"
      };
    }

    try {
      const userRequest = args.userRequest.trim();
      
      // Transform practice appointment types to MatcherAppointmentType format
      const availableTypes: MatcherAppointmentType[] = practice.appointmentTypes.map(type => ({
        id: type.id, // Laine CUID
        name: type.name,
        duration: type.duration,
        keywords: type.keywords,
        nexhealthAppointmentTypeId: type.nexhealthAppointmentTypeId
      }));

      console.log(`[findAppointmentType] Using AI to match "${userRequest}" against ${availableTypes.length} appointment types`);

      // Use LLM to match the appointment type
      const matchedInfo = await matchAppointmentTypeWithLLM(userRequest, availableTypes);

      if (matchedInfo.matched && matchedInfo.id && matchedInfo.name && matchedInfo.duration && matchedInfo.nexhealthAppointmentTypeId) {
        // Update conversation state with the determined appointment type
        conversationState.updateAppointmentType(matchedInfo.id, matchedInfo.name, matchedInfo.duration);
        
        console.log(`[findAppointmentType] AI successfully matched "${userRequest}" to "${matchedInfo.name}" (${matchedInfo.id})`);

        return {
          success: true,
          message_to_patient: "", // Will be filled by dynamic generation
          data: {
            matched: true,
            appointment_type_id: matchedInfo.id, // Laine CUID
            appointment_type_name: matchedInfo.name,
            duration_minutes: matchedInfo.duration,
            nexhealth_appointment_type_id: matchedInfo.nexhealthAppointmentTypeId, // For booking
            user_request: userRequest,
            match_reasoning: matchedInfo.reasoning
          }
        };
      } else {
        // No match found - provide available options
        const typeOptions = availableTypes
          .slice(0, 5) // Limit to 5 options for voice
          .map(type => type.name);
          
        console.log(`[findAppointmentType] AI could not match "${userRequest}". Reason: ${matchedInfo.reasoning}`);

        return {
          success: true,
          message_to_patient: "", // Will be filled by dynamic generation
          data: {
            matched: false,
            user_request: userRequest,
            match_reasoning: matchedInfo.reasoning,
            available_types_list_for_prompt: typeOptions,
            total_types_available: availableTypes.length
          }
        };
      }

    } catch (error) {
      console.error(`[findAppointmentType] Error during AI matching:`, error);
      
      let errorCode = "APPOINTMENT_TYPE_AI_ERROR";
      
      if (error instanceof Error) {
        if (error.message.includes("OpenAI API key")) {
          errorCode = "AI_CONFIGURATION_ERROR";
        } else if (error.message.includes("400") || error.message.includes("validation")) {
          errorCode = "AI_VALIDATION_ERROR";
        }
      }
      
      return {
        success: false,
        error_code: errorCode,
        message_to_patient: "", // Will be filled by dynamic generation
        details: error instanceof Error ? error.message : "Unknown error during AI matching"
      };
    }
  }
};

export default findAppointmentTypeTool; 