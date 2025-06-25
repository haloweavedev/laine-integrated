// Core VAPI TypeScript type definitions for type safety
// These types are based on VAPI API documentation and webhook specifications

export interface VapiToolFunctionParameters {
  type: "object";
  properties: {
    [key: string]: {
      type: "string" | "number" | "boolean";
      description: string;
    };
  };
  required?: string[];
}

export interface VapiToolFunction {
  name: string;
  description: string;
  parameters: VapiToolFunctionParameters;
}

export interface VapiToolServer {
  url: string;
  timeoutSeconds?: number;
  async?: boolean;
}

export interface VapiTool {
  type: "function";
  function: VapiToolFunction;
  server: VapiToolServer;
  messages?: any[]; // Define more strictly if custom messages are used
}

export interface VapiUpdatePayload {
  model: {
    provider: "openai";
    model: string;
    temperature?: number;
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
    tools?: VapiTool[]; // Array of tool definitions
    toolIds?: string[];
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  firstMessage: string;
  serverUrl?: string;
  serverMessages?: string[];
}

export interface ServerMessageToolCallItem {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ServerMessageToolCallsPayload {
  message: {
    type: "tool-calls";
    toolCallList: ServerMessageToolCallItem[];
    call: {
      id: string;
      orgId?: string;
    };
  };
}

export interface VapiToolResult {
  toolCallId: string;
  result?: string;
  error?: string;
} 