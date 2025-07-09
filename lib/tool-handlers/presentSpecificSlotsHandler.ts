import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { DateTime } from "luxon";
import type { ConversationState, VapiToolResult } from "@/types/vapi";

// TIME_BUCKETS constant copied from slotHelper.ts
const TIME_BUCKETS = {
  Early:     { start: "05:00", end: "08:30" },
  Morning:   { start: "05:00", end: "12:00" },
  Midday:    { start: "10:00", end: "15:00" },
  Afternoon: { start: "12:00", end: "17:00" },
  Evening:   { start: "15:30", end: "20:00" },
  Late:      { start: "17:00", end: "22:00" },
  AllDay:    { start: "05:00", end: "22:00" }
};

type TimeBucket = keyof typeof TIME_BUCKETS;

interface PresentSpecificSlotsArgs {
  timeBucket: string;
}

interface HandlerResult {
  toolResponse: VapiToolResult;
  newState: ConversationState;
}

/**
 * Generate a natural AI response presenting specific slots from a chosen time bucket
 * @param currentState Current conversation state containing presented slots
 * @param timeBucket The chosen time bucket (e.g., "Afternoon")
 * @param practiceTimezone Practice timezone for proper formatting
 * @returns Generated AI response offering specific time slots
 */
async function generateSpecificSlotResponse(
  currentState: ConversationState,
  timeBucket: string,
  practiceTimezone: string
): Promise<string> {
  const presentedSlots = currentState.appointmentBooking.presentedSlots || [];
  const spokenName = currentState.appointmentBooking.spokenName || 'appointment';
  
  // Filter slots to the chosen time bucket
  const timeBucketRange = TIME_BUCKETS[timeBucket as TimeBucket];
  if (!timeBucketRange) {
    return `I'm sorry, I couldn't understand that time preference. Could you please choose from morning, afternoon, or evening?`;
  }
  
  const [startHour, startMinute] = timeBucketRange.start.split(':').map(Number);
  const [endHour, endMinute] = timeBucketRange.end.split(':').map(Number);
  
  const bucketSlots = presentedSlots.filter(slot => {
    const slotTime = DateTime.fromISO(slot.time);
    const slotHour = slotTime.hour;
    const slotMinute = slotTime.minute;
    
    const slotTimeInMinutes = slotHour * 60 + slotMinute;
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;
    
    return slotTimeInMinutes >= startTimeInMinutes && slotTimeInMinutes <= endTimeInMinutes;
  });
  
  if (bucketSlots.length === 0) {
    return `I'm sorry, I don't actually have any slots available in the ${timeBucket.toLowerCase()}. Would you like to try a different time of day?`;
  }
  
  // Take first 2-3 slots from the bucket
  const slotsToPresent = bucketSlots.slice(0, 3);
  const formattedSlots = slotsToPresent.map(slot => {
    const slotDateTime = DateTime.fromISO(slot.time).setZone(practiceTimezone);
    return slotDateTime.toFormat('h:mm a');
  }).join(' or ');
  
  const prompt = `You are an AI response generator. Your only job is to create a SINGLE, fluid, natural-sounding sentence offering specific appointment times.

Context:
- Appointment Type: "${spokenName}"
- Time Period: "${timeBucket}"
- Available Times: "${formattedSlots}"

Example Output: "Okay, in the ${timeBucket.toLowerCase()} I have ${formattedSlots}. Does one of those work?"

Your turn. Generate the single, fluid, spoken response for Laine:`;
  
  try {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      maxTokens: 100
    });
    
    return text.trim() || `In the ${timeBucket.toLowerCase()}, I have ${formattedSlots}. Does one of those work?`;
  } catch (error) {
    console.error('[Specific Slot Response] Error generating AI response:', error);
    return `In the ${timeBucket.toLowerCase()}, I have ${formattedSlots}. Does one of those work?`;
  }
}

export async function handlePresentSpecificSlots(
  currentState: ConversationState,
  toolArguments: PresentSpecificSlotsArgs,
  toolId: string
): Promise<HandlerResult> {
  const { timeBucket } = toolArguments;
  
  console.log(`[PresentSpecificSlotsHandler] Processing time bucket selection: "${timeBucket}"`);
  
  try {
    // Get practice details for timezone
    const { prisma } = await import("@/lib/prisma");
    const practice = await prisma.practice.findUnique({
      where: { id: currentState.practiceId },
      select: { timezone: true }
    });

    const practiceTimezone = practice?.timezone || 'America/Chicago';

    // Generate AI response with specific slots for the selected time bucket
    const aiResponse = await generateSpecificSlotResponse(
      currentState,
      timeBucket,
      practiceTimezone
    );

    // Update state to indicate we are now awaiting slot confirmation
    const newState: ConversationState = {
      ...currentState,
      currentStage: 'AWAITING_SLOT_CONFIRMATION'
    };

    const toolResponse: VapiToolResult = {
      toolCallId: toolId,
      result: aiResponse
    };

    console.log(`[PresentSpecificSlotsHandler] Successfully presented specific slots for ${timeBucket}`);

    return {
      toolResponse,
      newState
    };

  } catch (error) {
    console.error(`[PresentSpecificSlotsHandler] Error processing time bucket selection:`, error);
    return {
      toolResponse: {
        toolCallId: toolId,
        error: "Error presenting specific time slots."
      },
      newState: currentState
    };
  }
} 