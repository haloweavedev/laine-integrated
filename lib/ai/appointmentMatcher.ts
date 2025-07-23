import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { CoreMessage } from "ai";

interface ApptTypeInputForMatcher {
  id: string; // nexhealthAppointmentTypeId
  name: string;
  keywords: string | null;
}

export async function matchAppointmentTypeIntent(
  patientQuery: string,
  availableAppointmentTypes: ApptTypeInputForMatcher[]
): Promise<string | null> {
  try {
    console.log(`[AI Matcher] Attempting to match query: "${patientQuery}"`);

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("[AI Matcher] OPENAI_API_KEY not found in environment variables");
      return null;
    }

    // Format appointment types for the LLM prompt
    const formattedTypesString = availableAppointmentTypes
      .map(type => `ID: ${type.id}, Name: ${type.name}, Keywords: ${type.keywords || "None"}`)
      .join("\n");

    // Construct messages for the generateText call
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an expert AI assistant for a dental office. Your task is to match a patient's stated reason for calling with the most appropriate dental appointment type from the provided list.
The list includes appointment type IDs, names, and associated keywords.
Respond ONLY with the 'ID' of the best matching appointment type.
If no clear match is found based on the patient's query and the available types/keywords, respond with "NO_MATCH".
Prioritize matches where the patient's query aligns well with the keywords or the name of the appointment type.
Consider common dental terms and patient language.
Example: If patient says "my tooth hurts badly", and an appointment type is "Emergency Exam" with keywords "toothache, pain, urgent", you should match it.
If patient says "I need a cleaning" and type is "Routine Cleaning", match it.
If patient says "I want to discuss veneers" and no cosmetic/veneer appointment type exists, return "NO_MATCH".`
      },
      {
        role: "user",
        content: `Patient's reason for calling: "${patientQuery}"

Available appointment types:
${formattedTypesString}

Which appointment type ID is the best match? (Return ONLY the ID or "NO_MATCH")`
      }
    ];

    // Call OpenAI with the messages
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.1,
      maxTokens: 50
    });

    console.log(`[AI Matcher] LLM response for matching: "${text}"`);

    // Process the response
    const trimmedResponse = text.trim();
    if (trimmedResponse === "NO_MATCH") {
      return null;
    }

    return trimmedResponse;

  } catch (error) {
    console.error("[AI Matcher] Error during AI call:", error);
    return null;
  }
} 