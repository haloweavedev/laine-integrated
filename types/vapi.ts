// Core VAPI TypeScript type definitions for type safety
// These types are based on VAPI API documentation and webhook specifications

import type { ConversationState } from './laine';



// Interface for tool chaining directive
export interface NextTool {
  toolName: string;
  toolArguments: Record<string, any>;
}

// Interface for individual slot data
export interface SlotData {
  time: string; // ISO format
  operatory_id?: number;
  providerId: number;
}

// Interface for checkAvailableSlots structured result data
export interface CheckSlotsResultData {
  foundSlots: SlotData[];
  nextAvailableDate: string | null;
}

// Updated HandlerResult interface to support tool chaining
export interface HandlerResult {
  toolResponse: VapiToolResult;
  newState: ConversationState;
  nextTool?: NextTool; // Optional field for autonomous tool chaining
}

// ConversationState has been moved to @/types/laine for the new canonical interface

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

export interface VapiFunctionCall {
  name: string;
  arguments: Record<string, any> | string; // Arguments can be an object or a stringified JSON
}

export interface ServerMessageToolCallItem {
  id: string; // This is VAPI's unique ID for this specific tool invocation
  type: "function"; // Assuming 'function' type for these tool calls
  function: VapiFunctionCall; // Contains the actual name and arguments
}

export interface ServerMessageToolCallsPayload {
  message: {
    type: "tool-calls";
    toolCallList?: ServerMessageToolCallItem[]; // VAPI payload shows 'toolCallList'
    toolCalls?: ServerMessageToolCallItem[]; // VAPI payload also shows 'toolCalls'
    call: {
      id: string;
      orgId?: string;
    };
  };
}

export interface VapiFunctionCall {
  type: 'function';
  function: {
    name: string;
    arguments: string; // Arguments must be a JSON string
  };
}

export interface VapiToolResult {
  toolCallId: string;
  result?: string | Record<string, any>;
  error?: string;
  message?: {
    type: string;
    role: string;
    content: string;
  };
  followUpFunctionCall?: VapiFunctionCall; // Add this new property
}

// === VAPI Webhook Message Types ===

// Base message structure for all VAPI webhook events
export interface VapiBaseMessage {
  timestamp: number;
  type: string; // The crucial field, e.g., "status-update", "transcript", "end-of-call-report"
  call?: {
    id: string;
    orgId?: string;
    assistantId?: string;
    status?: string;
    startedAt?: string;
    endedAt?: string;
    endedReason?: string;
    cost?: string;
  };
  assistant?: {
    id: string;
    name?: string;
  };
}

// Status update message (e.g., call started, ended, etc.)
export interface VapiStatusUpdateMessage extends VapiBaseMessage {
  type: "status-update";
  status?: string; // e.g., "queued", "ringing", "in-progress", "ended"
  endedReason?: string; // e.g., "customer-ended-call", "assistant-ended-call"
  call: {
    id: string;
    orgId?: string;
    assistantId: string;
    status: string;
    startedAt?: string;
    endedAt?: string;
    endedReason?: string;
    cost?: string;
  };
}

// End of call report message with summary and final details
export interface VapiEndOfCallReportMessage extends VapiBaseMessage {
  type: "end-of-call-report";
  summary?: string;
  transcript?: {
    url?: string;
    text?: string;
  };
  call: {
    id: string;
    orgId?: string;
    assistantId: string;
    status: string;
    startedAt?: string;
    endedAt?: string;
    endedReason?: string;
    cost?: string;
  };
}

// Transcript message for real-time or full transcript updates
export interface VapiTranscriptMessage extends VapiBaseMessage {
  type: "transcript";
  transcript?: {
    text?: string;
    url?: string;
  };
  call: {
    id: string;
    orgId?: string;
    assistantId: string;
    status?: string;
    startedAt?: string;
  };
}

// Union type for all possible VAPI webhook messages
export type VapiWebhookMessage = 
  | VapiStatusUpdateMessage 
  | VapiEndOfCallReportMessage 
  | VapiTranscriptMessage 
  | VapiBaseMessage;

// Complete webhook payload structure
export interface VapiWebhookPayload {
  message: VapiWebhookMessage;
  // Potentially other top-level fields from VAPI if any
} 

export interface ApiLogEntry {
  timestamp: string;
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
  response?: {
    status?: number;
    statusText?: string;
    body?: unknown;
    success: boolean;
    error?: string;
  };
}

export type ApiLog = ApiLogEntry[]; 