import { generateText, CoreMessage } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function generateCallSummaryForNote(transcript: string): Promise<string> {
  if (!transcript || transcript.trim() === "") {
    console.warn("[Summarization] Empty transcript provided, returning default note.");
    return "Call booked via Laine AI. No detailed transcript summary available.";
  }

  // Ensure OPENAI_API_KEY is available
  if (!process.env.OPENAI_API_KEY) {
    console.error("[Summarization] OPENAI_API_KEY is not set. Cannot generate summary.");
    throw new Error("OpenAI API key not configured for summarization.");
  }

  const messages: CoreMessage[] = [
    {
      role: 'system',
      content: `You are an expert summarization AI for a dental office. 
      Your task is to summarize the following call transcript into a concise note for the appointment record. 
      The note should be factual and directly relevant for the dental staff.
      Focus on:
      1. Patient's primary reason for the call/appointment.
      2. Key symptoms or requests mentioned by the patient.
      3. Any specific treatments discussed or agreed upon.
      4. Relevant patient history if mentioned (e.g., "new patient", "returning for follow-up").
      Keep the summary very brief and professional, ideally under 50-75 words.
      Start the summary directly without introductory phrases like "The patient called to..." or "Summary:".
      Example: "New patient, toothache in lower right molar for 3 days, sensitive to cold. Discussed limited exam and X-ray."
      `,
    },
    {
      role: 'user',
      content: `Call Transcript:\n"""\n${transcript}\n"""`,
    },
  ];

  try {
    const { text, finishReason, usage } = await generateText({
      model: openai('gpt-4o-mini'), // Using GPT-4o as specified
      messages,
      temperature: 0.3, // Lower temperature for more factual summary
      maxTokens: 330,   // Max tokens for the summary itself
    });
    console.log(`[Summarization] Summary generated. Finish reason: ${finishReason}, Usage: ${JSON.stringify(usage)}`);
    return text.trim();
  } catch (error) {
    console.error("[Summarization] Error generating call summary with OpenAI:", error);
    // Fallback to a simpler note if summarization fails
    return "Call booked via Laine AI. AI summary generation encountered an issue.";
  }
} 