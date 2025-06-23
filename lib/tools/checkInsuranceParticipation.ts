import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

export const checkInsuranceParticipationSchema = z.object({
  insuranceProviderName: z.string().min(1)
    .describe("Dental insurance provider name patient mentioned (e.g., 'Cigna', 'Healthplex', 'Renaissance'). Extract primary insurer name.")
});

const checkInsuranceParticipationTool: ToolDefinition<typeof checkInsuranceParticipationSchema> = {
  name: "check_insurance_participation",
  description: "Checks whether the practice is in-network or out-of-network with patient's dental insurance provider. Call when patient mentions insurance provider or asks about acceptance. Requires insuranceProviderName. Returns participation status, is_in_network boolean, accepted insurances list. Works independently.",
  schema: checkInsuranceParticipationSchema,
  prerequisites: [
    {
      argName: 'insuranceProviderName',
      askUserMessage: "I can check that for you! What's the name of your dental insurance provider?"
    }
  ],
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice } = context;
    
    try {
      // Check if practice has accepted insurances configured
      if (!practice.acceptedInsurances || practice.acceptedInsurances.trim() === '') {
        return {
          success: true, // Tool ran, but no configuration data available
          error_code: "INSURANCE_CONFIG_MISSING",
          message_to_patient: "", // Will be filled by dynamic generation
          data: { 
            insuranceProviderName: args.insuranceProviderName,
            participation: "unknown_configuration",
            practiceAcceptedList: null,
            practice_name: practice.name,
            config_available: false
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
          message_to_patient: "", // Will be filled by dynamic generation
          data: {
            insuranceProviderName: args.insuranceProviderName,
            participation: "in-network",
            practiceAcceptedList: practice.acceptedInsurances,
            practice_name: practice.name,
            is_in_network: true,
            config_available: true
          }
        };
      } else {
        return {
          success: true,
          message_to_patient: "", // Will be filled by dynamic generation
          data: {
            insuranceProviderName: args.insuranceProviderName,
            participation: "out-of-network",
            practiceAcceptedList: practice.acceptedInsurances,
            practice_name: practice.name,
            is_in_network: false,
            config_available: true
          }
        };
      }

    } catch (error) {
      console.error(`[checkInsuranceParticipation] Error:`, error);
      
      return {
        success: false,
        error_code: "EXECUTION_ERROR",
        message_to_patient: "", // Will be filled by dynamic generation
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
};

export default checkInsuranceParticipationTool; 