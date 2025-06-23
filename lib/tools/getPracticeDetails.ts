import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

export const getPracticeDetailsSchema = z.object({});

const getPracticeDetailsTool: ToolDefinition<typeof getPracticeDetailsSchema> = {
  name: "get_practice_details",
  description: "Retrieves practice information including address and location details. Call when patient asks for practice address, location, or directions. No arguments needed. Returns address and practice_name. Works independently, can be called anytime.",
  schema: getPracticeDetailsSchema,
  
  async run({ context }): Promise<ToolResult> {
    const { practice } = context;
    
    try {
      // Check if practice address exists and is not empty
      if (!practice.address || practice.address.trim() === '') {
        return {
          success: false,
          error_code: "PRACTICE_DETAIL_MISSING",
          message_to_patient: "", // Will be filled by dynamic generation
          details: "Practice address is not configured",
          data: {
            practice_name: practice.name,
            address_available: false
          }
        };
      }

      return {
        success: true,
        message_to_patient: "", // Will be filled by dynamic generation
        data: { 
          address: practice.address,
          practice_name: practice.name,
          address_available: true
        }
      };

    } catch (error) {
      console.error(`[getPracticeDetails] Error:`, error);
      
      return {
        success: false,
        error_code: "EXECUTION_ERROR",
        message_to_patient: "", // Will be filled by dynamic generation
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
};

export default getPracticeDetailsTool; 