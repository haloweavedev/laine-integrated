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

export async function generateAppointmentConfirmationMessage(
  patientQuery: string,
  officialName: string,
  spokenName: string,
  matchedAppointmentDuration: number
): Promise<string> {
  try {
    console.log(`[AI Responder] Generating confirmation for: ${officialName} (spoken: ${spokenName})`);

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("[AI Responder] OPENAI_API_KEY not found in environment variables");
      return `Okay, we can schedule a ${spokenName} which is ${matchedAppointmentDuration} minutes. Is that correct?`;
    }

    // Construct messages for the generateText call
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an AI response generator. Your ONLY job is to create a SINGLE, fluid, natural-sounding sentence for a voice assistant named Laine.

**CRITICAL RULES:**
1.  **USE THE SPOKEN NAME:** The user must hear the 'Spoken Name', not the 'Official Name'.
2.  **ONE UNBROKEN SENTENCE:** Your entire output must be a single sentence. Do not break it up.
3.  **NO FILLER:** Do not add "Just a sec" or "Give me a moment".

**Example:**
- Input: Spoken Name: "a full check-up with x-rays", Duration: 60
- Correct Output: "Okay, for a full check-up with x-rays, that will take about 60 minutes. Does that sound right?"
- Incorrect Output: "Okay. For a full check-up... that's 60 minutes. Sound good?"`
      },
      {
        role: "user",
        content: `Patient's original request: "${patientQuery}"
Identified appointment:
- Official Name: "${officialName}"
- Spoken Name: "${spokenName}"
- Duration: ${matchedAppointmentDuration} minutes.

Example Output: "Okay, for ${spokenName}, that will take about ${matchedAppointmentDuration} minutes. Does that sound right?"

Your turn. Generate the single, fluid, spoken response for Laine:`
      }
    ];

    // Call OpenAI with the messages
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.7,
      maxTokens: 150
    });

    console.log(`[AI Responder] Generated message: "${text}"`);

    // Process the response: trim and ensure single line
    const processedResponse = text.trim().replace(/\n/g, " ");
    return processedResponse;

  } catch (error) {
    console.error("[AI Responder] Error during AI call:", error);
    // Provide fallback response using spokenName
    return `Okay, we can schedule ${spokenName} which is ${matchedAppointmentDuration} minutes. Is that correct?`;
  }
}

export async function generateUrgentAppointmentConfirmationMessage(
  patientQuery: string,
  officialName: string,
  spokenName: string,
  matchedAppointmentDuration: number
): Promise<string> {
  try {
    console.log(`[AI Responder] Generating urgent confirmation for: ${officialName} (spoken: ${spokenName})`);

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("[AI Responder] OPENAI_API_KEY not found in environment variables");
      return `I'm so sorry to hear you're in pain. For ${spokenName}, we'll need about ${matchedAppointmentDuration} minutes, so let's find the absolute soonest time we can get you in.`;
    }

    // Construct messages for the generateText call
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an AI response generator for urgent dental situations. Your ONLY job is to create a SINGLE, fluid, natural-sounding sentence for a voice assistant named Laine.

**CRITICAL RULES:**
1.  **BE EMPATHETIC:** Acknowledge the patient's pain/problem (e.g., "I'm so sorry to hear you're in pain").
2.  **USE THE SPOKEN NAME:** The user must hear the 'Spoken Name', not the 'Official Name'.
3.  **STATE DURATION:** Mention the appointment duration.
4.  **TRANSITION TO FINDING TIME:** End by transitioning directly to finding a time. NEVER ask for confirmation like "Does that sound right?".
5.  **ONE UNBROKEN SENTENCE:** Your entire output must be a single sentence.
6.  **NO FILLER:** Do not add "Just a sec" or "Give me a moment".

**Example Output:** "I'm so sorry to hear you're in pain. For a Limited Exam and X-rays, we'll need about 40 minutes, so let's find the absolute soonest time we can get you in."

**FORBIDDEN:** Do NOT ask confirmation questions like "Does that sound right?" or "Is that correct?"`
      },
      {
        role: "user",
        content: `Patient's urgent request: "${patientQuery}"
Identified appointment:
- Official Name: "${officialName}"
- Spoken Name: "${spokenName}"
- Duration: ${matchedAppointmentDuration} minutes.

Your turn. Generate the single, empathetic, spoken response for Laine that acknowledges their problem, states the appointment details, and transitions directly to finding a time:`
      }
    ];

    // Call OpenAI with the messages
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.7,
      maxTokens: 150
    });

    console.log(`[AI Responder] Generated urgent message: "${text}"`);

    // Process the response: trim and ensure single line
    const processedResponse = text.trim().replace(/\n/g, " ");
    return processedResponse;

  } catch (error) {
    console.error("[AI Responder] Error during AI call for urgent message:", error);
    // Provide fallback response using spokenName
    return `I'm so sorry to hear you're in pain. For ${spokenName}, we'll need about ${matchedAppointmentDuration} minutes, so let's find the absolute soonest time we can get you in.`;
  }
} 