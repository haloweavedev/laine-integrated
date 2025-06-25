// VAPI API Client for managing assistants and calls
// Docs: https://docs.vapi.ai

const VAPI_API_BASE_URL = "https://api.vapi.ai";
const VAPI_API_KEY = process.env.VAPI_API_KEY;

if (!VAPI_API_KEY) {
  console.warn("VAPI_API_KEY not configured - VAPI features will not work");
}

// Basic VAPI types based on their API documentation
export interface VapiModel {
  provider: "openai" | "groq" | "anthropic" | "anyscale" | "togetherai";
  model: string; // e.g., "gpt-3.5-turbo", "gpt-4", etc.
  temperature?: number;
  maxTokens?: number;
  messages: Array<{
    role: "system" | "user" | "assistant" | "function";
    content: string;
  }>;
  tools?: VapiTool[];
}

export interface VapiVoice {
  provider: "11labs" | "openai" | "playht" | "lmnt" | "neets" | "rime" | "vapi";
  voiceId: string; // Provider-specific voice ID
  speed?: number;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  }
  
export interface VapiAssistant {
  id: string;
  name: string;
  model: VapiModel;
  voice: VapiVoice;
  firstMessage?: string;
  serverUrl?: string;
  serverMessages?: string[];
  silenceTimeoutSeconds?: number;
  maxDurationSeconds?: number;
  backgroundSound?: "off" | "office";
  backchannelingEnabled?: boolean;
  backgroundDenoisingEnabled?: boolean;
  modelOutputInMessagesEnabled?: boolean;
  transportConfigurations?: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssistantDTO {
  name: string;
  model: VapiModel;
  voice: VapiVoice;
  firstMessage?: string;
  serverUrl?: string;
  serverMessages?: string[];
  silenceTimeoutSeconds?: number;
  maxDurationSeconds?: number;
  backgroundSound?: "off" | "office";
  backchannelingEnabled?: boolean;
  backgroundDenoisingEnabled?: boolean;
  modelOutputInMessagesEnabled?: boolean;
  transportConfigurations?: Record<string, unknown>[];
}

export interface UpdateAssistantDTO extends Partial<CreateAssistantDTO> {
  // All fields from CreateAssistantDTO are optional for updates
  // This interface extends Partial<CreateAssistantDTO> to allow partial updates
  _placeholder?: never; // Placeholder to avoid empty interface error
}

// Import types from the new types file
import type { VapiUpdatePayload, VapiTool } from '@/types/vapi';
export type { VapiUpdatePayload, VapiTool } from '@/types/vapi';

async function vapiRequest(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!VAPI_API_KEY) {
    throw new Error("VAPI_API_KEY is not configured");
  }

  const url = `${VAPI_API_BASE_URL}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  console.log(`[VAPI API] ${method} ${url}`);
  if (body) {
    console.log("[VAPI API] Request body:", JSON.stringify(body, null, 2));
  }

  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[VAPI API] Error (${response.status}):`, errorText);
      throw new Error(`VAPI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log(`[VAPI API] Response:`, JSON.stringify(data, null, 2));
    return data as Record<string, unknown>;
  } catch (error) {
    console.error("[VAPI API] Request failed:", error);
    throw error;
  }
}

export async function createVapiAssistant(assistantConfig: CreateAssistantDTO): Promise<VapiAssistant> {
  console.log("[VAPI] Creating assistant:", assistantConfig.name);
  const result = await vapiRequest("/assistant", "POST", assistantConfig as unknown as Record<string, unknown>);
  return result as unknown as VapiAssistant;
}

// Refactored updateVapiAssistant function for Subphase 1.1
export async function updateVapiAssistant(assistantId: string, payload: VapiUpdatePayload): Promise<void> {
  console.log(`[VAPI Update] Updating assistant ID: ${assistantId}`);
  
  try {
    await vapiRequest(`/assistant/${assistantId}`, "PATCH", payload as unknown as Record<string, unknown>);
    console.log(`[VAPI Update] Successfully updated assistant ID: ${assistantId}`);
  } catch (error) {
    console.error(`[VAPI Update] Failed to update assistant ${assistantId}:`, error);
    throw error;
  }
}

export async function getVapiAssistant(assistantId: string): Promise<VapiAssistant | null> {
  try {
    console.log(`[VAPI] Getting assistant ${assistantId}`);
    const result = await vapiRequest(`/assistant/${assistantId}`, "GET");
    return result as unknown as VapiAssistant;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("404")) {
      console.log(`[VAPI] Assistant ${assistantId} not found`);
      return null;
    }
    throw error;
  }
}

export async function deleteVapiAssistant(assistantId: string): Promise<void> {
  console.log(`[VAPI] Deleting assistant ${assistantId}`);
  await vapiRequest(`/assistant/${assistantId}`, "DELETE");
}

// Function to verify VAPI webhook requests (if VAPI provides signing)
export async function verifyVapiRequest(): Promise<{ verified: boolean; error?: string }> {
  // TODO: Implement if VAPI provides request signing
  // For now, return true as a placeholder
  console.log("[VAPI] Request verification - not yet implemented");
  return { verified: true };
} 