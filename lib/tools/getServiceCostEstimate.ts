import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

export const getServiceCostEstimateSchema = z.object({
  serviceName: z.string().min(1)
    .describe("Dental service name patient asked about (e.g., 'limited exam and x-rays', 'cleaning', 'new patient special'). Match to patient's exact request.")
});

const getServiceCostEstimateTool: ToolDefinition<typeof getServiceCostEstimateSchema> = {
  name: "get_service_cost_estimate",
  description: "Provides cost estimates for dental services based on practice configuration. Call when patient asks about pricing, costs, or fees for specific services. Requires serviceName. Returns estimate, found boolean, practice_name. Helpful for out-of-network/self-pay patients. Works independently.",
  schema: getServiceCostEstimateSchema,
  prerequisites: [
    {
      argName: 'serviceName',
      askUserMessage: "I can help you with that! What specific service or procedure would you like to know the cost for?"
    }
  ],
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice, conversationState } = context;
    
    // If serviceName is not provided in args but we have appointment type context, use it
    let serviceName = args.serviceName;
    if (!serviceName && conversationState.determinedAppointmentTypeName) {
      console.log(`[getServiceCostEstimate] Using appointment type from ConversationState: ${conversationState.determinedAppointmentTypeName}`);
      serviceName = conversationState.determinedAppointmentTypeName;
    }
    
    try {
      // Check if practice has service cost estimates configured
      if (!practice.serviceCostEstimates || practice.serviceCostEstimates.trim() === '') {
        return {
          success: true, // Tool ran, but no configuration data available
          error_code: "COST_CONFIG_MISSING",
          message_to_patient: "", // Will be filled by dynamic generation
          data: { 
            serviceName: serviceName,
            found: false,
            estimate: null,
            practice_name: practice.name,
            config_available: false
          }
        };
      }

      // Parse the service cost estimates string (e.g., "Cleaning: $120, Exam and X-rays: $80, New Patient Special: $129")
      const serviceCosts: Array<{ service: string; cost: string }> = [];
      
      const entries = practice.serviceCostEstimates.split(',').map(entry => entry.trim());
      
      for (const entry of entries) {
        if (entry.includes(':')) {
          const [servicePart, costPart] = entry.split(':', 2);
          const service = servicePart?.trim();
          const cost = costPart?.trim();
          
          if (service && cost) {
            serviceCosts.push({ service, cost });
          }
        }
      }

      if (serviceCosts.length === 0) {
        return {
          success: true,
          error_code: "COST_CONFIG_INVALID",
          message_to_patient: "", // Will be filled by dynamic generation
          data: { 
            serviceName: serviceName,
            found: false,
            estimate: null,
            practice_name: practice.name,
            config_available: false
          }
        };
      }

      // Normalize the service name for matching
      const normalizedServiceName = serviceName.trim().toLowerCase();

      // Try to find a matching service
      const matchedService = serviceCosts.find(serviceItem => 
        serviceItem.service.toLowerCase().includes(normalizedServiceName) ||
        normalizedServiceName.includes(serviceItem.service.toLowerCase())
      );

      if (matchedService) {
        return {
          success: true,
          message_to_patient: "", // Will be filled by dynamic generation
          data: {
            serviceName: serviceName,
            estimate: matchedService.cost,
            found: true,
            matchedKey: matchedService.service,
            practice_name: practice.name,
            config_available: true,
            exact_match: true
          }
        };
      }

      // Check for "New Patient Special" or similar as a fallback for general inquiries
      const specialOffer = serviceCosts.find(serviceItem => 
        serviceItem.service.toLowerCase().includes('special') ||
        serviceItem.service.toLowerCase().includes('new patient')
      );

      if (specialOffer && (
        normalizedServiceName.includes('new') || 
        normalizedServiceName.includes('first') || 
        normalizedServiceName.includes('visit') ||
        normalizedServiceName.includes('appointment')
      )) {
        return {
          success: true,
          message_to_patient: "", // Will be filled by dynamic generation
          data: {
            serviceName: serviceName,
            estimate: specialOffer.cost,
            found: true,
            type: "special_offer",
            matchedKey: specialOffer.service,
            practice_name: practice.name,
            config_available: true,
            exact_match: false,
            is_special_offer: true
          }
        };
      }

      // No match found
      return {
        success: true,
        message_to_patient: "", // Will be filled by dynamic generation
        data: {
          serviceName: serviceName,
          found: false,
          estimate: null,
          practice_name: practice.name,
          config_available: true,
          available_services: serviceCosts.map(sc => sc.service)
        }
      };

    } catch (error) {
      console.error(`[getServiceCostEstimate] Error:`, error);
      
      return {
        success: false,
        error_code: "EXECUTION_ERROR",
        message_to_patient: "", // Will be filled by dynamic generation
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
};

export default getServiceCostEstimateTool; 