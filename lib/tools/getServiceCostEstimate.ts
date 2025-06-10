import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

export const getServiceCostEstimateSchema = z.object({
  serviceName: z.string().min(1)
    .describe("The name of the dental service the patient is asking about (e.g., 'limited exam and x-rays', 'cleaning', 'new patient special'). Try to match this to common service names or what the patient explicitly states.")
});

const getServiceCostEstimateTool: ToolDefinition<typeof getServiceCostEstimateSchema> = {
  name: "get_service_cost_estimate",
  description: "Provides an estimated cost for specified dental services, particularly for out-of-network or self-pay patients. Use this when a patient asks about the cost of a visit or service (e.g., 'How much would that be?').",
  schema: getServiceCostEstimateSchema,
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice } = context;
    
    try {
      // Check if practice has service cost estimates configured
      if (!practice.serviceCostEstimates || practice.serviceCostEstimates.trim() === '') {
        return {
          success: true, // Tool ran, but no configuration data available
          error_code: "COST_CONFIG_MISSING",
          message_to_patient: "I don't have specific cost information on file in my system. The office staff can provide you with an estimate when you speak with them.",
          data: { 
            serviceName: args.serviceName,
            found: false,
            estimate: null
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
          message_to_patient: "I'm having trouble reading the cost information in my system. The office staff can provide you with accurate pricing.",
          data: { 
            serviceName: args.serviceName,
            found: false,
            estimate: null
          }
        };
      }

      // Normalize the service name from args for matching
      const normalizedServiceName = args.serviceName.trim().toLowerCase();

      // Try to find a matching service
      const matchedService = serviceCosts.find(serviceItem => 
        serviceItem.service.toLowerCase().includes(normalizedServiceName) ||
        normalizedServiceName.includes(serviceItem.service.toLowerCase())
      );

      if (matchedService) {
        return {
          success: true,
          message_to_patient: `For a ${matchedService.service}, the estimated cost is ${matchedService.cost}.`,
          data: {
            serviceName: args.serviceName,
            estimate: matchedService.cost,
            found: true,
            matchedKey: matchedService.service
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
          message_to_patient: `While I don't have a specific estimate for ${args.serviceName}, we do have a ${specialOffer.service} for ${specialOffer.cost} which typically covers an initial exam and necessary x-rays. Would that be something you're interested in?`,
          data: {
            serviceName: args.serviceName,
            estimate: specialOffer.cost,
            found: true,
            type: "special_offer",
            matchedKey: specialOffer.service
          }
        };
      }

      // No match found
      return {
        success: true,
        message_to_patient: `I couldn't find a specific cost estimate for ${args.serviceName} in my system. Our team at the office can provide you with more detailed pricing information.`,
        data: {
          serviceName: args.serviceName,
          found: false,
          estimate: null
        }
      };

    } catch (error) {
      console.error(`[getServiceCostEstimate] Error:`, error);
      
      return {
        success: false,
        error_code: "EXECUTION_ERROR",
        message_to_patient: "I'm unable to retrieve cost estimates right now. Please contact the office for pricing information.",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me check on that cost estimate for you...",
    success: "I have some information on the cost.",
    fail: "I'm unable to retrieve cost estimates right now."
  }
};

export default getServiceCostEstimateTool; 