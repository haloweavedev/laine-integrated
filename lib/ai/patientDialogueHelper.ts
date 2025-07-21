import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { spellOut, formatPhoneNumberForReadback } from "@/lib/utils/text-helpers";
import { DateTime } from "luxon";
import type { ConversationState } from "@/types/vapi";

/**
 * Generates a natural, contextual question to ask the user for the next piece of information.
 * @param state The current conversation state.
 * @returns A promise that resolves to the question to ask the user.
 */
export async function generateNextQuestion(state: ConversationState): Promise<string> {
  const { nextInfoToCollect, collectedInfo } = state.patientDetails;
  const firstName = collectedInfo.firstName || "";

  let questionType: string;
  switch (nextInfoToCollect) {
    case 'dob':
      questionType = "date of birth";
      break;
    case 'phone':
      questionType = "phone number";
      break;
    case 'email':
      questionType = "email address";
      break;
    default:
      // Fallback for an unexpected state
      return "What other information can you provide?";
  }

  const prompt = `You are an AI response generator for a friendly and professional dental receptionist AI named Laine.
Your task is to generate a single, fluid, and natural-sounding question.

**CRITICAL RULES:**
1.  **ONE UNBROKEN SENTENCE.**
2.  The question must be for the specified "Question Type".
3.  If a first name is provided, use it to make the question more personal.
4.  Vary your phrasing. Do not use the same sentence structure every time.

**Context:**
- Patient's First Name: ${firstName || "Not yet provided"}
- Question Type to Ask: ${questionType}

**Example Output (if name is 'Jane' and type is 'date of birth'):** "Thanks, Jane. And what is your date of birth?"
**Example Output (if name is 'Tom' and type is 'phone number'):** "Got it. And what's the best phone number to reach you, Tom?"
**Example Output (if name is 'Sarah' and type is 'email address'):** "Perfect. And finally, what's your email address?"

Your turn. Generate the single, fluid, spoken response for Laine:`;

  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: prompt,
      temperature: 0.7,
      maxTokens: 50,
    });
    return result.text.trim();
  } catch (error) {
    console.error("[PatientDialogueHelper] Error generating next question:", error);
    // Fallback to a simple template
    return `And what is your ${questionType}?`;
  }
}

/**
 * Generates a single, fluid confirmation summary of all collected patient data.
 * @param state The current conversation state, containing all collected info.
 * @returns A promise that resolves to the full confirmation question.
 */
export async function generateConfirmationSummary(state: ConversationState): Promise<string> {
  const { firstName, lastName, dob, phone, email } = state.patientDetails.collectedInfo;

  // Format data for clarity
  const fullName = `${firstName || ""} ${lastName || ""}`.trim();
  const spelledOutName = `${spellOut(firstName || "")}... ${spellOut(lastName || "")}`;
  const formattedDob = dob ? DateTime.fromISO(dob).toFormat("MMMM d, yyyy") : "Not provided";
  const formattedPhone = phone ? formatPhoneNumberForReadback(phone) : "Not provided";

  const prompt = `You are an AI response generator for a friendly and professional dental receptionist AI named Laine.
Your task is to generate a single, comprehensive confirmation summary as one fluid statement ending in a question.

**CRITICAL RULES:**
1.  **ONE FLUID STATEMENT.** Start with a phrase like "Okay, great." or "Perfect."
2.  Summarize all the provided details clearly.
3.  End with a clear confirmation question like "Is that all correct?".

**Context:**
- Full Name: ${fullName}
- Spelled-out Name: ${spelledOutName}
- Date of Birth: ${formattedDob}
- Phone Number (for read-back): ${formattedPhone}
- Email: ${email || "Not provided"}

**Example Output:** "Okay, great. I just want to make sure I have everything right for your file. I have the name as Alex Chen, spelled A. L. E. X... C. H. E. N., date of birth June 1st, 1992, and the best phone number is 5 5 5... 8 6 7... 5 3 0 9. Is that all correct?"

Your turn. Generate the single, fluid, spoken confirmation for Laine:`;

  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: prompt,
      temperature: 0.5,
      maxTokens: 150,
    });
    return result.text.trim();
  } catch (error) {
    console.error("[PatientDialogueHelper] Error generating confirmation summary:", error);
    // Fallback to a simple template
    return `Okay, I have your name as ${fullName}, date of birth ${formattedDob}, and phone number ${phone}. Is that all correct?`;
  }
} 