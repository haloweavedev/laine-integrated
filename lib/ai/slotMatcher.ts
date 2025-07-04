import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { DateTime } from 'luxon';
import type { CoreMessage } from "ai";

interface SlotData {
  time: string; // ISO format
  operatory_id?: number;
  providerId: number;
}

/**
 * Uses AI to match a user's verbal selection to the best available slot
 * @param userSelection The user's verbatim selection (e.g., "the 2 PM one", "tomorrow at 7:40 AM")
 * @param presentedSlots Array of slots that were previously presented to the user
 * @returns The matching slot object or null if no match found
 */
export async function matchUserSelectionToSlot(
  userSelection: string,
  presentedSlots: SlotData[]
): Promise<SlotData | null> {
  if (!presentedSlots || presentedSlots.length === 0) {
    console.warn('[SlotMatcher] No presented slots to match against');
    return null;
  }

  try {
    // Create a numbered list of slots for the AI to reference
    const slotOptions = presentedSlots.map((slot, index) => {
      const slotTime = DateTime.fromISO(slot.time);
      const dayName = slotTime.toFormat('cccc'); // Full day name
      const time = slotTime.toFormat('h:mm a'); // 2:00 PM format
      const date = slotTime.toFormat('MMM d'); // Dec 23 format
      
      return `${index + 1}. ${dayName}, ${date} at ${time}`;
    }).join('\n');

    const prompt = `You are helping match a user's verbal response to a specific appointment time slot.

The user was previously offered these time slot options:
${slotOptions}

The user's response was: "${userSelection}"

Your task: Determine which numbered slot (1, 2, 3, etc.) best matches what the user said.

Rules:
- Return ONLY the number of the matching slot (e.g., "1", "2", "3")
- If the user's response is unclear or doesn't match any slot, return "NO_MATCH"
- Consider variations like "the first one", "2 PM", "tomorrow morning", "that works", "yes"
- Be flexible with time references and casual language

Response:`;

    const messages: CoreMessage[] = [
      { role: 'user', content: prompt }
    ];

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.1,
      maxTokens: 10
    });

    const result = text.trim();
    
    if (!result || result === 'NO_MATCH') {
      console.log(`[SlotMatcher] No match found for user selection: "${userSelection}"`);
      return null;
    }

    // Parse the slot number
    const slotNumber = parseInt(result, 10);
    if (isNaN(slotNumber) || slotNumber < 1 || slotNumber > presentedSlots.length) {
      console.warn(`[SlotMatcher] Invalid slot number returned: ${result}`);
      return null;
    }

    const selectedSlot = presentedSlots[slotNumber - 1]; // Convert to 0-based index
    console.log(`[SlotMatcher] Successfully matched "${userSelection}" to slot ${slotNumber}: ${selectedSlot.time}`);
    
    return selectedSlot;

  } catch (error) {
    console.error('[SlotMatcher] Error matching user selection to slot:', error);
    return null;
  }
} 