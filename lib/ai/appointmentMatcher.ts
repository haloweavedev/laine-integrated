/**
 * AppointmentMatcher AI Utility
 * 
 * Uses an LLM to intelligently match user's spoken requests for appointments
 * to the practice's available appointment types, considering names and keywords.
 */

import { generateText, CoreMessage } from 'ai';
import { openai } from '@ai-sdk/openai';

/**
 * Interface for appointment type data input to the matcher
 */
export interface MatcherAppointmentType {
  id: string; // Laine CUID for the AppointmentType
  name: string;
  duration: number;
  keywords?: string | null; // From AppointmentType.keywords
  nexhealthAppointmentTypeId: string; // NexHealth ID for booking later
}

/**
 * Interface for the LLM's appointment matching response
 */
export interface MatchedAppointmentInfo {
  matched: boolean;
  id: string | null; // Laine CUID of the matched AppointmentType
  name: string | null;
  duration: number | null;
  nexhealthAppointmentTypeId: string | null;
  reasoning?: string; // Optional: LLM's reasoning for the match
}

/**
 * Matches a user's spoken appointment request to available appointment types using an LLM
 * 
 * @param userUtterance - The user's spoken request for an appointment type
 * @param availableTypes - Array of available appointment types from the practice
 * @returns Promise<MatchedAppointmentInfo> - The matching result with confidence and details
 */
export async function matchAppointmentTypeWithLLM(
  userUtterance: string,
  availableTypes: MatcherAppointmentType[]
): Promise<MatchedAppointmentInfo> {
  // Ensure OPENAI_API_KEY is available
  if (!process.env.OPENAI_API_KEY) {
    console.error("[AppointmentMatcher] OPENAI_API_KEY is not set. Cannot perform AI matching.");
    throw new Error("OpenAI API key not configured for appointment matching.");
  }

  if (!userUtterance || userUtterance.trim() === "") {
    console.warn("[AppointmentMatcher] Empty user utterance provided.");
    return {
      matched: false,
      id: null,
      name: null,
      duration: null,
      nexhealthAppointmentTypeId: null,
      reasoning: "No user request provided"
    };
  }

  if (!availableTypes || availableTypes.length === 0) {
    console.warn("[AppointmentMatcher] No available appointment types provided.");
    return {
      matched: false,
      id: null,
      name: null,
      duration: null,
      nexhealthAppointmentTypeId: null,
      reasoning: "No appointment types available to match against"
    };
  }

  try {
    // Prepare available types for the LLM (exclude sensitive IDs from prompt)
    const typesForPrompt = availableTypes.map(type => ({
      name: type.name,
      keywords: type.keywords || '',
      duration: type.duration
    }));

    const systemPrompt = `You are an expert AI assistant helping a dental receptionist match patient requests to available appointment types.

Your task is to analyze the patient's spoken request and find the best matching appointment type from the practice's available options.

Guidelines:
1. Prioritize exact name matches first
2. Then consider strong keyword matches  
3. Consider partial name matches
4. Look for common dental terminology and synonyms
5. Be confident only when there's a clear match
6. If uncertain or no good match exists, set matched to false

The patient's request is: "${userUtterance}"

Available appointment types:
${JSON.stringify(typesForPrompt, null, 2)}

Respond with ONLY a JSON object matching this exact structure:
{
  "matched": boolean,
  "appointmentTypeIndex": number_or_null,
  "reasoning": "brief explanation of your matching decision"
}

If you find a confident match, set "matched" to true and provide the index (0-based) of the matched type from the available types array.
If you cannot find a confident match, set "matched" to false and "appointmentTypeIndex" to null.

Examples of good matches:
- "cleaning" matches "Dental Cleaning" or types with "cleaning" keywords
- "checkup" matches "Routine Exam" or types with "exam, checkup" keywords  
- "toothache" or "pain" matches "Emergency" or types with "urgent, pain" keywords
- "filling" matches "Restorative" or types with "filling, cavity" keywords`;

    const userMessage = `Patient request: "${userUtterance}"

Available appointment types:
${JSON.stringify(typesForPrompt, null, 2)}`;

    const messages: CoreMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    console.log(`[AppointmentMatcher] Matching "${userUtterance}" against ${availableTypes.length} available types`);

    const { text: llmResponse } = await generateText({
      model: openai('gpt-4o-mini'),
      messages,
      temperature: 0.3, // Lower temperature for more consistent matching
      maxTokens: 300, // Sufficient for our structured response
    });

    console.log(`[AppointmentMatcher] LLM raw response: ${llmResponse}`);

    // Parse the LLM response
    let parsedResponse: { matched: boolean; appointmentTypeIndex: number | null; reasoning?: string };
    try {
      parsedResponse = JSON.parse(llmResponse.trim());
    } catch (parseError) {
      console.error("[AppointmentMatcher] Failed to parse LLM response as JSON:", parseError);
      console.error("[AppointmentMatcher] Raw LLM response:", llmResponse);
      return {
        matched: false,
        id: null,
        name: null,
        duration: null,
        nexhealthAppointmentTypeId: null,
        reasoning: "Failed to parse AI response"
      };
    }

    // Validate and construct result
    if (!parsedResponse.matched || parsedResponse.appointmentTypeIndex === null || parsedResponse.appointmentTypeIndex === undefined) {
      return {
        matched: false,
        id: null,
        name: null,
        duration: null,
        nexhealthAppointmentTypeId: null,
        reasoning: parsedResponse.reasoning || "No confident match found"
      };
    }

    // Validate the index
    const matchIndex = parsedResponse.appointmentTypeIndex;
    if (matchIndex < 0 || matchIndex >= availableTypes.length) {
      console.error(`[AppointmentMatcher] Invalid appointment type index from LLM: ${matchIndex}`);
      return {
        matched: false,
        id: null,
        name: null,
        duration: null,
        nexhealthAppointmentTypeId: null,
        reasoning: "Invalid match index from AI"
      };
    }

    // Get the matched appointment type
    const matchedType = availableTypes[matchIndex];
    
    console.log(`[AppointmentMatcher] Successfully matched "${userUtterance}" to "${matchedType.name}"`);

    return {
      matched: true,
      id: matchedType.id,
      name: matchedType.name,
      duration: matchedType.duration,
      nexhealthAppointmentTypeId: matchedType.nexhealthAppointmentTypeId,
      reasoning: parsedResponse.reasoning || "AI found a confident match"
    };

  } catch (error) {
    console.error("[AppointmentMatcher] Error during LLM appointment matching:", error);
    return {
      matched: false,
      id: null,
      name: null,
      duration: null,
      nexhealthAppointmentTypeId: null,
      reasoning: "Technical error during AI matching"
    };
  }
}