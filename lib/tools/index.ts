import { ToolDefinition, VapiToolSchema, VapiToolFunction } from "./types";
import { zodToJsonSchema } from "zod-to-json-schema";

// Import all tools
import getIntentTool from "./getIntent";
import findPatientTool from "./findPatient";
import findAppointmentTypeTool from "./findAppointmentType";
import checkAvailableSlotsTool from "./checkAvailableSlots";
import bookAppointmentTool from "./bookAppointment";
import createNewPatientTool from "./createNewPatient";
import getPracticeDetailsTool from "./getPracticeDetails";
import checkInsuranceParticipationTool from "./checkInsuranceParticipation";
import getServiceCostEstimateTool from "./getServiceCostEstimate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tools: ToolDefinition<any>[] = [
  getIntentTool,
  findPatientTool,
  findAppointmentTypeTool,
  checkAvailableSlotsTool,
  bookAppointmentTool,
  createNewPatientTool,
  getPracticeDetailsTool,
  checkInsuranceParticipationTool,
  getServiceCostEstimateTool
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getToolByName(name: string): ToolDefinition<any> | undefined {
  return tools.find(t => t.name === name);
}

// This function builds the array for VAPI's `model.tools[]`
export function buildVapiTools(appBaseUrl: string): VapiToolSchema[] {
  console.log(`Building VAPI tools for ${tools.length} registered tools`);
  
  return tools.map(tool => {
    // Generate JSON schema without $schema property
    const schema = zodToJsonSchema(tool.schema, { 
      target: "jsonSchema7", 
      $refStrategy: "none" 
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $schema, ...parameters } = schema;
    
    const vapiToolFunction: VapiToolFunction = {
      name: tool.name,
      description: tool.description,
      parameters
    };
    
    const vapiTool: VapiToolSchema = {
      type: "function",
      async: tool.async ?? false,
      function: vapiToolFunction,
      server: { 
        url: `${appBaseUrl}/api/vapi/tool-calls`
      }
    };

    // Messages will now be dynamically generated, so no static messages
    
    console.log(`Built VAPI tool: ${tool.name} -> ${vapiTool.server.url}`);
    return vapiTool;
  });
}

// Export individual tool schemas for validation
export { getIntentSchema } from "./getIntent";
export { findPatientSchema } from "./findPatient";
export { findAppointmentTypeSchema } from "./findAppointmentType";
export { checkAvailableSlotsSchema } from "./checkAvailableSlots";
export { bookAppointmentSchema } from "./bookAppointment";
export { createNewPatientSchema } from "./createNewPatient";
export { getPracticeDetailsSchema } from "./getPracticeDetails";
export { checkInsuranceParticipationSchema } from "./checkInsuranceParticipation";
export { getServiceCostEstimateSchema } from "./getServiceCostEstimate"; 