// lib/tools/types.ts
import { z } from "zod";
import { Practice } from "@prisma/client"; // Assuming your Practice model

// For VAPI tool definition
export interface VapiToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema object - we'll use Zod's shape directly
}

export interface VapiToolSchema {
  type: "function";
  async?: boolean;
  function: VapiToolFunction;
  server: {
    url: string; // URL to your generic tool handler or specific tool endpoint
    secret?: string; // Optional secret for verifying VAPI requests to this tool
  };
  messages?: Array<{ // Optional messages for VAPI to speak during tool call
    type: "request-start" | "request-response-delayed" | "request-complete" | "request-failed";
    content?: string;
    timingMilliseconds?: number;
  }>;
}

// Internal tool definition structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<T extends z.ZodType<any, any>> {
  name: string;
  description: string;
  schema: T; // Zod schema for arguments
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (params: { args: z.infer<T>; practice: Practice; vapiCallId?: string }) => Promise<any>; // Tool execution logic
  messages?: { // Optional messages for VAPI
    start?: string;
    delay?: string;
    success?: string;
    fail?: string;
  };
  async?: boolean; // If VAPI should handle this as an async tool
} 