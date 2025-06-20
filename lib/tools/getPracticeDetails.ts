import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

export const getPracticeDetailsSchema = z.object({});

const getPracticeDetailsTool: ToolDefinition<typeof getPracticeDetailsSchema> = {
  name: "get_practice_details",
  description: `
    Retrieves practice information including address and location details.
    WHEN TO USE: Call this tool when a patient asks for the practice's address, location, or directions, or when confirming appointment location.
    REQUIRED INPUTS: None (no arguments needed).
    OUTPUTS: Returns 'address' and 'practice_name' if available, or indicates if address is not configured.
    USE CASE: Helpful for providing directions, confirming appointment locations, or answering general practice information inquiries.
    NOTE: This tool works independently and can be called at any time during the conversation.
  `.trim(),
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