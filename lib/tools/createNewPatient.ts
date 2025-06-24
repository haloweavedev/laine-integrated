import { z } from "zod";
import { ToolDefinition, conversationStateSchema } from "./types";

// Schema for arguments VAPI's LLM should extract.
// These are all optional as data is collected iteratively.
export const createNewPatientArgsSchema = z.object({
  firstName: z.string().optional().describe("Patient's first name, if provided in this turn."),
  lastName: z.string().optional().describe("Patient's last name, if provided in this turn."),
  fullName: z.string().optional().describe("Patient's full name (first and last) if provided together in this turn."),
  // For DOB, VAPI's LLM should be encouraged by system prompt to normalize to YYYY-MM-DD if possible,
  // but the handler will also attempt normalization.
  dateOfBirth: z.string().optional().describe("Patient's date of birth (e.g., 'May 5th 1985', '1985-05-05'), if provided in this turn."),
  phone: z.string().optional().describe("Patient's phone number, if provided in this turn."),
  email: z.string().optional().describe("Patient's email address, if provided in this turn."),
  // This flag is crucial for the final confirmation step.
  userConfirmation: z.boolean().optional().describe("Set to true if the user verbally confirms that all collected details (name, DOB, phone, email) are correct before creating the patient record."),
  conversationState: conversationStateSchema,
});

export type ParsedCreateNewPatientArgs = z.infer<typeof createNewPatientArgsSchema>;

const createNewPatientTool: ToolDefinition<typeof createNewPatientArgsSchema> = {
  name: "create_new_patient",
  description: "Collects or confirms new patient details (name, DOB, phone, email) step-by-step. Use to gather missing info or to finalize with 'userConfirmation:true' after all details are confirmed by the user. Input: any details user provides in the current turn, 'conversationState'. This tool is silent; the backend provides the conversational response.",
  schema: createNewPatientArgsSchema,
  // 'run' method is intentionally removed. Logic handled by lib/ai/patientOnboardingHandler.ts
};

export default createNewPatientTool; 