import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { CoreMessage } from "ai";
import type { SlotData } from "@/types/vapi";
import { DateTime } from "luxon";

export async function matchUserSelectionToSlot(
  userSelection: string,
  presentedSlots: SlotData[],
  practiceTimezone: string
): Promise<SlotData | null> {
  try {
    if (!presentedSlots || presentedSlots.length === 0) {
      console.error("[SlotMatcher] No presented slots provided to match against.");
      return null;
    }

    // Create a simplified, numbered list of slots for the AI to parse.
    const formattedSlotsForAI = presentedSlots.map((slot, index) => {
      const time = DateTime.fromISO(slot.time, { zone: practiceTimezone }).toFormat("h:mm a");
      return `${index + 1}. ${time}`;
    }).join("\n");

    const systemPrompt = `You are a highly accurate AI assistant specializing in natural language understanding. Your task is to match a user's verbal selection to one of the provided time slot options.

**CRITICAL RULES:**
1.  **RETURN ONLY THE NUMBER:** Your entire response must be ONLY the number corresponding to the best match.
2.  **HANDLE AMBIGUITY:** If the user's selection is ambiguous or doesn't clearly match any option, return "NO_MATCH".
3.  **BE FLEXIBLE:** Understand various phrasings. "The first one," "the 2 PM slot," "seven forty," and "the later one" should all be interpreted correctly based on the options.

**CONTEXT:**
The user was presented with the following time slot options:
${formattedSlotsForAI}

The user then said: "${userSelection}"

**EXAMPLES:**
- If options are "1. 2:00 PM\n2. 2:40 PM" and user says "The first one," you return "1".
- If options are "1. 7:00 AM\n2. 7:40 AM" and user says "The 7 40 one," you return "2".
- If options are "1. 9:00 AM\n2. 10:00 AM" and user says "Let's do the later one," you return "2".
- If user says "None of those work," you return "NO_MATCH".

Which option number did the user select? (Return ONLY the number or "NO_MATCH")`;

    const messages: CoreMessage[] = [{ role: 'system', content: systemPrompt }];

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0, // Set to 0 for maximum predictability
      maxTokens: 10,
    });

    const matchedIndex = parseInt(text.trim(), 10) - 1;

    if (!isNaN(matchedIndex) && matchedIndex >= 0 && matchedIndex < presentedSlots.length) {
      const matchedSlot = presentedSlots[matchedIndex];
      console.log(`[SlotMatcher] Successfully matched "${userSelection}" to slot #${matchedIndex + 1}: ${matchedSlot.time}`);
      return matchedSlot;
    }

    console.log(`[SlotMatcher] No definitive match found for user selection: "${userSelection}". AI response: "${text.trim()}"`);
    return null;

  } catch (error) {
    console.error("[SlotMatcher] Error during AI slot matching:", error);
    return null;
  }
} 