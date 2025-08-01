import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { CoreMessage } from "ai";

/**
 * Generates a short, context-aware acknowledgment phrase based on the user's request.
 * Produces empathetic responses for painful/negative requests, encouraging responses 
 * for positive/cosmetic requests, and simple professional acknowledgments for routine requests.
 * @param patientRequest The patient's stated reason for calling or request
 * @returns A promise that resolves to a contextually appropriate acknowledgment string
 */
export async function generateAcknowledgment(patientRequest: string): Promise<string> {
  try {
    const systemPrompt = `You are an expert AI copywriter specializing in creating short, natural-sounding conversational acknowledgments for a dental receptionist. Your response MUST be a single, short phrase and nothing else. Do not add any extra text or pleasantries.

- If the user's request sounds painful or negative (e.g., "broken tooth," "toothache," "crown fell off"), generate an empathetic response.
  - Example for "My crown fell off": "Oh no, that's no fun. Let's get that sorted for you."
- If the user's request is for a cosmetic or positive procedure (e.g., "veneers," "whitening," "Invisalign"), generate an encouraging and positive response.
  - Example for "I want to get my teeth whitened": "That's exciting! A brighter smile is a great goal."
- If the user's request is neutral or routine (e.g., "I need a cleaning," "check-up"), generate a simple, pleasant acknowledgment.
  - Example for "I'd like to schedule a cleaning": "Of course, we can definitely get that scheduled for you."`;

    const messages: CoreMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: patientRequest }
    ];

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.2,
      maxTokens: 50,
    });

    return text.trim();

  } catch (error) {
    console.error(`[AcknowledgmentGenerator] Error generating acknowledgment for request: "${patientRequest}"`, error);
    return '';
  }
} 