import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

export const checkInsuranceParticipationSchema = z.object({
  insuranceProviderName: z.string().min(1)
    .describe("The name of the dental insurance provider the patient mentioned (e.g., 'Cigna', 'Healthplex', 'Renaissance'). Extract the primary name of the insurer.")
});

const checkInsuranceParticipationTool: ToolDefinition<typeof checkInsuranceParticipationSchema> = {
  name: "check_insurance_participation",
  description: "Checks if the dental practice is in-network or out-of-network with a patient's stated dental insurance provider. Use this after the patient mentions their insurance company.",
  schema: checkInsuranceParticipationSchema,
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice } = context;
    
    try {
      // Check if practice has accepted insurances configured
      if (!practice.acceptedInsurances || practice.acceptedInsurances.trim() === '') {
        return {
          success: true, // Tool ran, but no configuration data available
          error_code: "INSURANCE_CONFIG_MISSING",
          message_to_patient: `This practice hasn't specified which insurances they accept in my system. It would be best to confirm directly with the office staff regarding your ${args.insuranceProviderName} plan. Would you like to proceed with scheduling for now, and we can clarify the insurance later?`,
          data: { 
            insuranceProviderName: args.insuranceProviderName,
            participation: "unknown_configuration",
            practiceAcceptedList: null
          }
        };
      }

      // Parse the accepted insurances string into an array
      const acceptedProviderNames = practice.acceptedInsurances
        .split(',')
        .map(name => name.trim().toLowerCase())
        .filter(name => name.length > 0);

      // Normalize the insurance provider name from args
      const normalizedInsuranceProviderName = args.insuranceProviderName.trim().toLowerCase();

      // Check for matches using includes for partial matching
      const isInNetwork = acceptedProviderNames.some(acceptedName => 
        acceptedName.includes(normalizedInsuranceProviderName) || 
        normalizedInsuranceProviderName.includes(acceptedName)
      );

      if (isInNetwork) {
        return {
          success: true,
          message_to_patient: `Great news! We are in-network with ${args.insuranceProviderName}. We can proceed with scheduling if you're ready. What type of appointment were you thinking of?`,
          data: {
            insuranceProviderName: args.insuranceProviderName,
            participation: "in-network",
            practiceAcceptedList: practice.acceptedInsurances
          }
        };
      } else {
        return {
          success: true,
          message_to_patient: `Based on the information I have, we might be out-of-network with ${args.insuranceProviderName}. You are still welcome to be seen here, but you would be responsible for the cost of the visit out-of-pocket. Would you like an estimate for the service you're considering, or would you like to discuss scheduling options?`,
          data: {
            insuranceProviderName: args.insuranceProviderName,
            participation: "out-of-network",
            practiceAcceptedList: practice.acceptedInsurances
          }
        };
      }

    } catch (error) {
      console.error(`[checkInsuranceParticipation] Error:`, error);
      
      return {
        success: false,
        error_code: "EXECUTION_ERROR",
        message_to_patient: "I had a little trouble checking the insurance. Please contact the office to verify your insurance coverage.",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me check that insurance for you...",
    success: "I've checked that insurance information.",
    fail: "I had a little trouble checking the insurance. Please bear with me."
  }
};

export default checkInsuranceParticipationTool; 