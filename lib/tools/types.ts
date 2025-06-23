// lib/tools/types.ts
import { z } from "zod";
import { Practice, AppointmentType, SavedProvider, SavedOperatory } from "@prisma/client";

// Enhanced practice context with scheduling data
export interface PracticeWithSchedulingData extends Practice {
  appointmentTypes: AppointmentType[];
  savedProviders: (SavedProvider & { 
    provider: { 
      id: string; 
      firstName: string | null; 
      lastName: string; 
      nexhealthProviderId: string; 
    };
    acceptedAppointmentTypes?: Array<{
      appointmentType: AppointmentType;
    }>;
    assignedOperatories?: Array<{
      savedOperatory: SavedOperatory;
    }>;
  })[];
  savedOperatories: SavedOperatory[];
}

// Tool execution context
export interface ToolExecutionContext {
  practice: PracticeWithSchedulingData;
  vapiCallId: string;
  toolCallId: string;
  assistantId: string;
  callSummaryForNote?: string; // ADD THIS LINE for bookAppointment tool
  conversationState: import('../conversationState').ConversationState; // Add conversation state
}

// Tool prerequisite definition
export interface ToolPrerequisite {
  argName: string; // The key of the argument in the tool's Zod schema (e.g., 'appointmentTypeId')
  askUserMessage: string; // The user-facing question Laine should ask if this prerequisite is missing.
                          // Example: "Okay, I can help with that. What type of appointment are you looking for?"
}

// Standardized tool result format
export interface ToolResult {
  success: boolean;
  message_to_patient: string;
  data?: Record<string, unknown>;
  error_code?: string;
  details?: string;
}

// VAPI tool definition interface
export interface VapiToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema object
}

export interface VapiToolSchema {
  type: "function";
  async?: boolean;
  function: VapiToolFunction;
  server: {
    url: string;
    secret?: string;
  };
  messages?: Array<{
    type: "request-start" | "request-response-delayed" | "request-complete" | "request-failed";
    content?: string;
    timingMilliseconds?: number;
  }>;
}

// Internal tool definition
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<T extends z.ZodType<any, any>> {
  name: string;
  description: string;
  schema: T;
  run: (params: { 
    args: z.infer<T>; 
    context: ToolExecutionContext 
  }) => Promise<ToolResult>;
  async?: boolean;
  prerequisites?: ToolPrerequisite[];
}

// VAPI webhook payload types
export interface VapiToolCall {
  toolCallId: string;
  name: string;
  arguments: string; // JSON string
}

export interface VapiToolCallsMessage {
  type: "tool-calls";
  timestamp: number;
  call: {
    id: string;
    assistantId: string;
    orgId?: string;
  };
  assistant: {
    id: string;
  };
  toolCallList: VapiToolCall[];
}

export interface VapiServerMessage {
  message: VapiToolCallsMessage;
}

// VAPI-COMPLIANT: Shared conversationState schema for all tools to include
// Now expects a JSON string instead of an object, since VAPI LLM will extract this from result.current_conversation_state_snapshot
export const conversationStateSchema = z.string().optional().describe("The JSON string captured from the `current_conversation_state_snapshot` field of the previous tool's `result`. MUST be passed with every tool call to maintain context continuity. Extract this string from parsing the previous tool response's `result` field, then pass it exactly as a string (do not parse it again). For the first tool call, this can be omitted or an empty JSON object string '{}'."); 