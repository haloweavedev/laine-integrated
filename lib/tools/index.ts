import { ToolDefinition, VapiToolSchema, VapiToolFunction } from "./types";
import { zodToJsonSchema } from "zod-to-json-schema";

// Import all tools
import findPatientTool from "./findPatient";
import findAppointmentTypeTool from "./findAppointmentType";
import checkAvailableSlotsTool from "./checkAvailableSlots";
import bookAppointmentTool from "./bookAppointment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tools: ToolDefinition<any>[] = [
  findPatientTool,
  findAppointmentTypeTool,
  checkAvailableSlotsTool,
  bookAppointmentTool
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

    // Add tool-specific messages if defined
    if (tool.messages) {
      vapiTool.messages = [
        tool.messages.start ? { type: "request-start", content: tool.messages.start } : null,
        tool.messages.delay ? { type: "request-response-delayed", content: tool.messages.delay, timingMilliseconds: 2000 } : null,
        tool.messages.success ? { type: "request-complete", content: tool.messages.success } : null,
        tool.messages.fail ? { type: "request-failed", content: tool.messages.fail } : null,
      ].filter(Boolean) as VapiToolSchema["messages"];
    }
    
    console.log(`Built VAPI tool: ${tool.name} -> ${vapiTool.server.url}`);
    return vapiTool;
  });
}

// Export individual tool schemas for validation
export { findPatientSchema } from "./findPatient";
export { findAppointmentTypeSchema } from "./findAppointmentType";
export { checkAvailableSlotsSchema } from "./checkAvailableSlots";
export { bookAppointmentSchema } from "./bookAppointment"; 