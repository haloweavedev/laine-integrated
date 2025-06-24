import { z } from "zod";
import { ToolDefinition, conversationStateSchema } from "./types";

// Schema for arguments VAPI's LLM should extract
export const findAppointmentTypeArgsSchema = z.object({
  userRawRequest: z.string().min(1).describe("The user's description of the dental service they need or their symptoms. Examples: 'a cleaning', 'my tooth hurts badly', 'checkup for my son'. This might be their initial statement or a response to a clarifying question."),
  conversationState: conversationStateSchema,
});

export type ParsedFindAppointmentTypeArgs = z.infer<typeof findAppointmentTypeArgsSchema>;

const findAppointmentTypeTool: ToolDefinition<typeof findAppointmentTypeArgsSchema> = {
  name: "find_appointment_type",
  description: "Identifies the specific dental appointment type based on the user's request or symptoms and the practice's available services. Input: 'userRawRequest', 'conversationState'. This tool is silent; the backend provides the conversational response.",
  schema: findAppointmentTypeArgsSchema,
  // 'run' method is intentionally removed. Logic handled by lib/ai/findAppointmentTypeHandler.ts
};

export default findAppointmentTypeTool; 