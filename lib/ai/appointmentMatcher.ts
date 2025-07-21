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
    console.log(`[AI Responder] Generating look-ahead confirmation for: ${officialName} (spoken: ${spokenName})`);

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("[AI Responder] OPENAI_API_KEY not found in environment variables");
      return `Okay, for ${spokenName}, we can get you scheduled. To get started, could I get your first and last name, please?`;
    }

    // Construct messages for the generateText call
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an AI response generator. Your task is to generate a single, fluid, two-part response for a voice assistant named Laine.

**CRITICAL RULES:**
1.  **TWO-PART STRUCTURE:** Create a complete sentence with two parts:
    - Part 1: Acknowledge the appointment type 
    - Part 2: Ask for their first and last name to begin patient identification
2.  **USE THE SPOKEN NAME:** The user must hear the 'Spoken Name', not the 'Official Name'.
3.  **TRANSITIONAL FLOW:** The sentence must flow naturally from confirmation to action.
4.  **ONE UNBROKEN SENTENCE:** Your entire output must be a single, flowing sentence.
5.  **NO FILLER:** Do not add "Just a sec" or "Give me a moment".

**Example Output:** "Okay, for ${spokenName}, we can get you scheduled. To get started, could I get your first and last name, please?<user_response_awaited>"

**FORBIDDEN:** Do NOT ask confirmation questions about the appointment type. Do NOT mention duration.`
      },
      {
        role: "user",
        content: `Patient's original request: "${patientQuery}"
Identified appointment:
- Official Name: "${officialName}"
- Spoken Name: "${spokenName}"
- Duration: ${matchedAppointmentDuration} minutes.

Your turn. Generate the single, fluid, two-part spoken response for Laine that acknowledges the appointment AND asks for their name:`
      }
    ];

    // Call OpenAI with the messages
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.7,
      maxTokens: 150
    });

    console.log(`[AI Responder] Generated look-ahead message: "${text}"`);

    // Process the response: trim and ensure single line
    const processedResponse = text.trim().replace(/\n/g, " ");
    return processedResponse;

  } catch (error) {
    console.error("[AI Responder] Error during AI call:", error);
    // Provide fallback response using spokenName
    return `Okay, for ${spokenName}, we can get you scheduled. To get started, could I get your first and last name, please?`;
  }
}

export async function generateWelcomeAppointmentConfirmationMessage(
  patientQuery: string,
  officialName: string,
  spokenName: string,
  matchedAppointmentDuration: number
): Promise<string> {
  try {
    console.log(`[AI Responder] Generating welcome look-ahead confirmation for: ${officialName} (spoken: ${spokenName})`);

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("[AI Responder] OPENAI_API_KEY not found in environment variables");
      return `That's wonderful, we love seeing new patients! For ${spokenName}, we can get you scheduled. To get started, could I get your first and last name, please?`;
    }

    // Construct messages for the generateText call
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an AI response generator. Your task is to generate a single, fluid, two-part response for a voice assistant named Laine that shows warmth and welcome to new patients.

**CRITICAL RULES:**
1.  **TWO-PART STRUCTURE:** Create a complete sentence with two parts:
    - Part 1: Express genuine warmth and excitement about new patients
    - Part 2: Ask for their first and last name to begin patient identification
2.  **WARM AND WELCOMING:** Express genuine excitement about new patients or referrals
3.  **USE THE SPOKEN NAME:** The user must hear the 'Spoken Name', not the 'Official Name'
4.  **TRANSITIONAL FLOW:** The sentence must flow naturally from welcome to action.
5.  **ONE UNBROKEN SENTENCE:** Your entire output must be a single, flowing sentence
6.  **NO FILLER:** Do not add "Just a sec" or "Give me a moment"

**Example Output:** "That's wonderful, we love seeing new patients! For ${spokenName}, we can get you scheduled. To get started, could I get your first and last name, please?<user_response_awaited>"

**FORBIDDEN:** Do NOT ask confirmation questions about the appointment type. Do NOT mention duration.`
      },
      {
        role: "user",
        content: `Patient's original request: "${patientQuery}"
Identified appointment:
- Official Name: "${officialName}"
- Spoken Name: "${spokenName}"
- Duration: ${matchedAppointmentDuration} minutes

The patient appears to be new or was referred. Generate a warm, welcoming, two-part response for Laine that expresses excitement AND asks for their name:`
      }
    ];

    // Call OpenAI with the messages
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.7,
      maxTokens: 150
    });

    console.log(`[AI Responder] Generated welcome look-ahead message: "${text}"`);

    // Process the response: trim and ensure single line
    const processedResponse = text.trim().replace(/\n/g, " ");
    return processedResponse;

  } catch (error) {
    console.error("[AI Responder] Error during AI call:", error);
    // Provide fallback response with warmth
    return `That's wonderful, we love seeing new patients! For ${spokenName}, we can get you scheduled. To get started, could I get your first and last name, please?`;
  }
}

export async function generateUrgentAppointmentConfirmationMessage(
  patientQuery: string,
  officialName: string,
  spokenName: string,
  matchedAppointmentDuration: number
): Promise<string> {
  try {
    console.log(`[AI Responder] Generating urgent look-ahead confirmation for: ${officialName} (spoken: ${spokenName})`);

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("[AI Responder] OPENAI_API_KEY not found in environment variables");
      return `I'm so sorry to hear you're in pain. For ${spokenName}, we can definitely get you seen. To get started, could I get your first and last name, please?`;
    }

    // Construct messages for the generateText call
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are an AI response generator for urgent dental situations. Your task is to generate a single, fluid, two-part response for a voice assistant named Laine.

**CRITICAL RULES:**
1.  **TWO-PART STRUCTURE:** Create a complete sentence with two parts:
    - Part 1: Empathetic acknowledgment of the patient's pain/urgency
    - Part 2: Ask for their first and last name to begin patient identification
2.  **BE EMPATHETIC:** Acknowledge the patient's pain/problem (e.g., "I'm so sorry to hear you're in pain").
3.  **USE THE SPOKEN NAME:** The user must hear the 'Spoken Name', not the 'Official Name'.
4.  **TRANSITIONAL FLOW:** The sentence must flow naturally from empathy to action.
5.  **ONE UNBROKEN SENTENCE:** Your entire output must be a single, flowing sentence.
6.  **NO FILLER:** Do not add "Just a sec" or "Give me a moment".

**Example Output:** "I'm so sorry to hear you're in pain, for ${spokenName} we can definitely get you seen. To get started, could I get your first and last name, please?<user_response_awaited>"

**FORBIDDEN:** Do NOT ask confirmation questions about the appointment type. Do NOT transition to scheduling yet.`
      },
      {
        role: "user",
        content: `Patient's urgent request: "${patientQuery}"
Identified appointment:
- Official Name: "${officialName}"
- Spoken Name: "${spokenName}"
- Duration: ${matchedAppointmentDuration} minutes.

Your turn. Generate the single, empathetic, two-part spoken response for Laine that acknowledges their problem AND asks for their name:`
      }
    ];

    // Call OpenAI with the messages
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.7,
      maxTokens: 150
    });

    console.log(`[AI Responder] Generated urgent look-ahead message: "${text}"`);

    // Process the response: trim and ensure single line
    const processedResponse = text.trim().replace(/\n/g, " ");
    return processedResponse;

  } catch (error) {
    console.error("[AI Responder] Error during AI call for urgent message:", error);
    // Provide fallback response using spokenName
    return `I'm so sorry to hear you're in pain. For ${spokenName}, we can definitely get you seen. To get started, could I get your first and last name, please?`;
  }
} 