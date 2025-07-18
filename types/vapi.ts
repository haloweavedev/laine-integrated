// Core VAPI TypeScript type definitions for type safety
// These types are based on VAPI API documentation and webhook specifications

export type PatientIdentificationStatus = 'UNKNOWN' | 'IDENTIFICATION_NEEDED' | 'INFO_GATHERING' | 'SEARCHING' | 'CREATING' | 'IDENTIFIED' | 'FAILED_MULTIPLE_MATCHES' | 'FAILED_CREATION' | 'ABORTED';

export type ConversationStage = 
  | 'GREETING'
  | 'IDENTIFYING_APPOINTMENT_TYPE'
  | 'CONFIRMING_APPOINTMENT_TYPE'
  | 'AWAITING_PATIENT_IDENTIFICATION'
  | 'GATHERING_AVAILABILITY_PREFERENCES'
  | 'PRESENTING_SLOTS'
  | 'AWAITING_TIME_BUCKET_SELECTION'
  | 'AWAITING_SLOT_CONFIRMATION'
  | 'AWAITING_FINAL_CONFIRMATION'
  | 'GATHERING_PATIENT_DETAILS'
  | 'READY_FOR_BOOKING'
  | 'BOOKING_CONFIRMED'
  | 'ENDED_NO_BOOKING';

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

// Updated HandlerResult interface to support tool chaining
export interface HandlerResult {
  toolResponse: VapiToolResult;
  newState: ConversationState;
  nextTool?: NextTool; // Optional field for autonomous tool chaining
}

export interface ConversationState {
  currentStage: ConversationStage;
  practiceId: string;
  callId: string;
  
  appointmentBooking: {
    typeId?: string;
    typeName?: string;
    spokenName?: string;
    duration?: number;
    patientRequest?: string;
    selectedSlot?: SlotData;
    presentedSlots?: SlotData[];
    nextAvailableDate?: string | null;
    lastTimePreference?: 'Morning' | 'Afternoon' | 'Evening' | 'Any';
    isUrgent?: boolean;
    isImmediateBooking?: boolean;
  };

  patientDetails: {
    status: PatientIdentificationStatus;
    nexhealthPatientId?: number;
    firstName?: string;
    lastName?: string;
    dob?: string; // Stored as YYYY-MM-DD
    phone?: string;
    email?: string;
    insuranceProvider?: string;
    insuranceMemberId?: string;
    infoToAskNext: 'fullName' | 'dob' | 'phone' | 'email' | 'confirmName' | 'confirmPhone' | 'confirmEmail' | 'insurance' | 'insuranceProvider' | 'insuranceMemberId' | null;
  };
}

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

export interface VapiToolResult {
  toolCallId: string;
  result?: string;
  error?: string;
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