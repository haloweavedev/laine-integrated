import { ToolDefinition, VapiToolSchema, VapiToolFunction } from "./types";
import { zodToJsonSchema } from "zod-to-json-schema";

// Manually import tools for now to avoid file system dependencies in edge runtime
import findPatientTool from "./findPatient";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tools: ToolDefinition<any>[] = [
  findPatientTool,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getToolByName(name: string): ToolDefinition<any> | undefined {
  return tools.find(t => t.name === name);
}

// This function builds the array for VAPI's `model.tools[]`
export function buildVapiTools(appBaseUrl: string): VapiToolSchema[] {
  console.log(`Building VAPI tools for ${tools.length} registered tools`);
  
  return tools.map(t => {
    // Generate JSON schema and remove $schema property that VAPI doesn't accept
    const schema = zodToJsonSchema(t.schema, { target: "jsonSchema7", $refStrategy: "none" });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $schema, ...schemaWithoutDollarSchema } = schema;
    
    const vapiToolFunction: VapiToolFunction = {
      name: t.name,
      description: t.description,
      parameters: schemaWithoutDollarSchema,
    };
    
    const vapiTool: VapiToolSchema = {
      type: "function",
      async: t.async ?? false,
      function: vapiToolFunction,
      // This server URL points to a single generic handler for all tools
      // VAPI will POST to this URL with the tool name and arguments in the payload
      server: { 
        url: `${appBaseUrl}/api/vapi/tool-handler`,
        // secret: process.env.VAPI_TOOL_WEBHOOK_SECRET // Add if VAPI supports per-tool secrets
      },
    };

    if (t.messages) {
      vapiTool.messages = [
        t.messages.start ? { type: "request-start", content: t.messages.start } : null,
        t.messages.delay ? { type: "request-response-delayed", content: t.messages.delay, timingMilliseconds: 2000 } : null,
        t.messages.success ? { type: "request-complete", content: t.messages.success } : null,
        t.messages.fail ? { type: "request-failed", content: t.messages.fail } : null,
      ].filter(Boolean) as VapiToolSchema["messages"];
    }
    
    console.log(`Built VAPI tool: ${t.name}`);
    return vapiTool;
  });
} 