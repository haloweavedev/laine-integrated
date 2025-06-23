import { z } from "zod";
import { ToolDefinition, ToolResult, conversationStateSchema } from "./types";

export const getIntentSchema = z.object({
  userUtterance: z.string().min(1).describe("The user's first significant utterance or the initial part of the conversation transcript that indicates their purpose for calling."),
  conversationState: conversationStateSchema,
});

const getIntentTool: ToolDefinition<typeof getIntentSchema> = {
  name: "get_intent",
  description: "Analyzes the user's initial statement(s) to determine their primary intent (e.g., BOOK_APPOINTMENT, RESCHEDULE_APPOINTMENT, INQUIRY_PRACTICE_DETAILS) and captures any stated reason for visit (e.g., 'jaw pain', 'cleaning', 'checkup'). Saves this to conversationState.intent and conversationState.reasonForVisit. This tool should be called early if intent is unclear from the user's first meaningful utterance. It does not directly respond to the user.",
  schema: getIntentSchema,
  async run({ args, context }): Promise<ToolResult> {
    const { conversationState } = context;
    const utterance = args.userUtterance;

    // --- Intent Parsing Logic ---
    // This uses keyword-based analysis for reliable intent detection
    // In a real production scenario, this could be enhanced with LLM-based analysis

    let determinedIntent: string | null = null;
    let determinedReason: string | null = null;

    const lowerUtterance = utterance.toLowerCase();

    // Primary intent detection based on keywords
    if (lowerUtterance.includes("book") || lowerUtterance.includes("schedule") || lowerUtterance.includes("appointment")) {
      // Check for specific booking contexts
      if (lowerUtterance.includes("new patient") || lowerUtterance.includes("first time") || lowerUtterance.includes("never been")) {
        determinedIntent = "NEW_PATIENT_BOOKING";
      } else if (lowerUtterance.includes("existing") || lowerUtterance.includes("current patient") || lowerUtterance.includes("been there before")) {
        determinedIntent = "EXISTING_PATIENT_BOOKING";
      } else {
        // General booking intent - patient status to be determined later
        determinedIntent = "BOOK_APPOINTMENT";
      }
    } else if (lowerUtterance.includes("reschedule") || lowerUtterance.includes("change") || lowerUtterance.includes("move my appointment")) {
      determinedIntent = "RESCHEDULE_APPOINTMENT";
    } else if (lowerUtterance.includes("cancel")) {
      determinedIntent = "CANCEL_APPOINTMENT";
    } else if (lowerUtterance.includes("hours") || lowerUtterance.includes("location") || lowerUtterance.includes("address") || lowerUtterance.includes("directions")) {
      determinedIntent = "INQUIRY_PRACTICE_DETAILS";
    } else if (lowerUtterance.includes("insurance") || lowerUtterance.includes("cost") || lowerUtterance.includes("price") || lowerUtterance.includes("payment")) {
      determinedIntent = "INQUIRY_FINANCIAL";
    }

    // Reason for visit extraction - common dental services and symptoms
    const painKeywords = ["pain", "ache", "hurts", "hurt", "toothache", "sore", "throb", "sensitive"];
    const cleaningKeywords = ["cleaning", "clean", "hygiene", "polish"];
    const checkupKeywords = ["check-up", "checkup", "exam", "examination", "check up"];
    const emergencyKeywords = ["emergency", "urgent", "broke", "broken", "chip", "chipped"];
    const cosmeticKeywords = ["whitening", "whiten", "cosmetic", "veneers", "smile"];
    const restorationKeywords = ["filling", "crown", "root canal", "extraction", "pull", "remove"];

    // Extract reason for visit based on keywords
    const reasonKeywords = [
      { keywords: painKeywords, reason: "pain" },
      { keywords: cleaningKeywords, reason: "cleaning" },
      { keywords: checkupKeywords, reason: "checkup" },
      { keywords: emergencyKeywords, reason: "emergency" },
      { keywords: cosmeticKeywords, reason: "cosmetic treatment" },
      { keywords: restorationKeywords, reason: "dental restoration" }
    ];

    for (const { keywords, reason } of reasonKeywords) {
      for (const keyword of keywords) {
        if (lowerUtterance.includes(keyword)) {
          determinedReason = reason;
          
          // Refine intent based on reason
          if (!determinedIntent && (reason === "pain" || reason === "emergency")) {
            determinedIntent = "URGENT_BOOKING";
          } else if (!determinedIntent && (reason === "cleaning" || reason === "checkup")) {
            determinedIntent = "ROUTINE_BOOKING";
          }
          break;
        }
      }
      if (determinedReason) break; // Stop after first match
    }

    // Fallback intent detection for appointment-related utterances without explicit "book" keyword
    if (!determinedIntent) {
      if (determinedReason || lowerUtterance.includes("need") || lowerUtterance.includes("want")) {
        if (lowerUtterance.includes("see") || lowerUtterance.includes("visit") || lowerUtterance.includes("come in")) {
          determinedIntent = "BOOK_APPOINTMENT";
        }
      }
    }

    // Update ConversationState with determined intent and reason
    if (determinedIntent) {
      conversationState.updateIntent(determinedIntent);
    }
    if (determinedReason) {
      conversationState.updateReasonForVisit(determinedReason);
    }

    console.log(`[getIntent] Utterance: "${utterance}" -> Intent: ${determinedIntent}, Reason: ${determinedReason}`);

    return {
      success: true,
      message_to_patient: "", // This tool does not speak to the user
      data: {
        intent: determinedIntent,
        reasonForVisit: determinedReason,
        intent_analysis_complete: true,
        utterance_analyzed: utterance
      }
    };
  }
};

export default getIntentTool; 