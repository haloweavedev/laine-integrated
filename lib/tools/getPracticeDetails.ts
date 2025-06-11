import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

export const getPracticeDetailsSchema = z.object({});

const getPracticeDetailsTool: ToolDefinition<typeof getPracticeDetailsSchema> = {
  name: "get_practice_details",
  description: "Retrieves specific logistical details about the dental practice, such as its full address. Use this typically towards the end of a call when providing confirmation and directions, or if a patient asks specifically for the practice's address or location information.",
  schema: getPracticeDetailsSchema,
  
  async run({ context }): Promise<ToolResult> {
    const { practice } = context;
    
    try {
      // Check if practice address exists and is not empty
      if (!practice.address || practice.address.trim() === '') {
        return {
          success: false,
          error_code: "PRACTICE_DETAIL_MISSING",
          message_to_patient: "I don't have the specific address details readily available in my system right now. However, our office team can certainly provide that to you. Were you looking to schedule an appointment?",
          details: "Practice address is not configured."
        };
      }

      return {
        success: true,
        message_to_patient: `Our practice is located at ${practice.address}. Is there anything else about our location you'd like to know?`,
        data: { 
          address: practice.address 
        }
      };

    } catch (error) {
      console.error(`[getPracticeDetails] Error:`, error);
      
      return {
        success: false,
        error_code: "EXECUTION_ERROR",
        message_to_patient: "I couldn't retrieve the practice details at the moment. Please contact the office for location information.",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me get those practice details for you...",
    success: "The practice details lookup is complete.",
    fail: "I couldn't retrieve the practice details at the moment."
  }
};

export default getPracticeDetailsTool; 