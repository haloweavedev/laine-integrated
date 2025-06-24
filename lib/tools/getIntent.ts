import { z } from "zod";
import { ToolDefinition, conversationStateSchema } from "./types"; // Ensure conversationStateSchema is imported

// Schema for arguments VAPI's LLM should extract for this tool
export const getIntentArgsSchema = z.object({
  userRawRequest: z.string().min(1).describe("The user's complete initial meaningful statement that indicates their purpose for calling. This should be their first substantial utterance beyond simple greetings. Examples: 'I need a cleaning', 'My tooth hurts can I book an appointment', 'I'd like to schedule a cleaning for next week'."),
  conversationState: conversationStateSchema, // From ./types, expects a JSON string
});

// Type for the parsed arguments
export type ParsedGetIntentArgs = z.infer<typeof getIntentArgsSchema>;

const getIntentTool: ToolDefinition<typeof getIntentArgsSchema> = {
  name: "get_intent",
  description: "FIRST TOOL TO CALL: Analyzes the user's initial meaningful statement to understand their primary reason for calling (e.g., booking, new patient inquiry, general question). Input: 'userRawRequest' (user's statement), 'conversationState' (JSON string from prior turn, if any). This tool is silent; the backend provides the conversational response.",
  schema: getIntentArgsSchema,
  // The 'run' method is intentionally removed.
  // Logic will be handled by an AI handler in lib/ai/intentHandler.ts
};

export default getIntentTool; 