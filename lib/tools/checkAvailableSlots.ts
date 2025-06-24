import { z } from "zod";
import { ToolDefinition, conversationStateSchema } from "./types";

// Schema for arguments VAPI's LLM should extract
export const checkAvailableSlotsArgsSchema = z.object({
  // VAPI's LLM should be prompted to provide date in YYYY-MM-DD format.
  // Handler can add further validation/normalization.
  requestedDate: z.string().describe("The desired date for the appointment, ideally in YYYY-MM-DD format. Examples: 'tomorrow', 'next Tuesday', 'July 15th 2025', '2025-07-15'."),
  // Optional: User might specify a time preference.
  timePreference: z.string().optional().describe("User's preferred time of day, if mentioned (e.g., 'morning', 'afternoon', 'around 2 PM')."),
  conversationState: conversationStateSchema,
});

export type ParsedCheckAvailableSlotsArgs = z.infer<typeof checkAvailableSlotsArgsSchema>;

const checkAvailableSlotsTool: ToolDefinition<typeof checkAvailableSlotsArgsSchema> = {
  name: "check_available_slots",
  description: "Checks for available appointment slots on a specific date, using appointment type and provider details from the conversation state. Input: 'requestedDate', optional 'timePreference', 'conversationState'. This tool is silent; the backend provides the conversational response with available slots.",
  schema: checkAvailableSlotsArgsSchema,
};

export default checkAvailableSlotsTool; 