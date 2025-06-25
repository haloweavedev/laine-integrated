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
  matchedAppointmentName: string,
  matchedAppointmentDuration: number
): Promise<string> {
  try {
    console.log(`[AI Responder] Generating confirmation for: ${matchedAppointmentName}`);

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("[AI Responder] OPENAI_API_KEY not found in environment variables");
      return `Okay, we can schedule a ${matchedAppointmentName} which is ${matchedAppointmentDuration} minutes. Is that correct?`;
    }

    // Construct messages for the generateText call
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: `You are Laine, a friendly, empathetic, and natural-sounding AI assistant for a dental office.
A patient has described their need, and you have identified a suitable appointment type.
Your task is to craft a concise, conversational, and reassuring response that will be spoken to the patient.
1. Briefly acknowledge the patient's stated problem/request in a natural way.
2. Clearly state the appointment type you've found for them.
3. Mention its typical duration.
4. End with a gentle confirmation question like "Does that sound about right?" or "Would that work for you?".
Avoid robotic phrasing. Sound human. Keep it to one or two short sentences. Ensure the entire response is a single line of text with no newline characters.

Example Acknowledgment Phrases:
- "Okay, I understand."
- "Got it."
- "Alright, for something like that..."
- "I see, so you're dealing with [paraphrased problem]..."

Example Full Responses (ensure these are single line when generated):
Patient said: "I have a terrible toothache in my back molar." Matched: "Emergency Exam", 30 mins.
Response: "Oh dear, a toothache can be really uncomfortable. For that, we have an Emergency Exam which typically takes about 30 minutes. Does that sound like what you need?"

Patient said: "I need a cleaning." Matched: "Standard Cleaning", 60 mins.
Response: "Okay, for a cleaning, our Standard Cleaning appointment is usually around 60 minutes. How does that sound?"`
      },
      {
        role: "user",
        content: `Patient's original request: "${patientQuery}"
Identified appointment: Name: "${matchedAppointmentName}", Duration: ${matchedAppointmentDuration} minutes.

Craft the spoken response for Laine (ensure it's a single line):`
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
    // Provide fallback response
    return `Okay, we can schedule a ${matchedAppointmentName} which is ${matchedAppointmentDuration} minutes. Is that correct?`;
  }
} 