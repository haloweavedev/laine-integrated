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
      const time = DateTime.fromISO(slot.time, { zone: practiceTimezone }).toFormat("cccc 'at' h:mm a");
      return `${index + 1}. ${time}`;
    }).join("\n");

    const systemPrompt = `You are a highly accurate AI assistant. Your task is to match a user's verbal selection to one of the provided time slot options.

**CRITICAL RULES:**
1.  **RETURN ONLY THE NUMBER:** Your entire response must be ONLY the number corresponding to the best match (e.g., "1", "2").
2.  **HANDLE AMBIGUITY:** If the user's selection is ambiguous or doesn't clearly match, return "NO_MATCH".
3.  **BE FLEXIBLE:** The user might not say the exact time. "The morning one," "the first one," "the 3:10," or "let's do the later one" are all valid selections. Use the context of the presented slots to find the best fit.
4.  **IGNORE EXTRA WORDS:** The user might say "Yes, the 8:30 is good." Focus on "8:30".

**CONTEXT:**
The user was presented with these numbered options:
${formattedSlotsForAI}

The user then said: "${userSelection}"

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