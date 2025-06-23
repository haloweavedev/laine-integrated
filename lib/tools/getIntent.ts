import { z } from "zod";
import { ToolDefinition, ToolResult, conversationStateSchema } from "./types";

export const getIntentSchema = z.object({
  userUtterance: z.string().min(1).describe("The user's complete initial meaningful statement that indicates their purpose for calling. This should be their first substantial utterance beyond greetings. Examples: 'I need a cleaning', 'My tooth hurts can I book an appointment', 'I'd like to schedule a cleaning for next week'."),
  conversationState: conversationStateSchema,
});

const getIntentTool: ToolDefinition<typeof getIntentSchema> = {
  name: "get_intent",
  description: "FIRST TOOL TO CALL: Analyzes the user's initial meaningful statement to determine their primary intent (BOOK_APPOINTMENT, RESCHEDULE_APPOINTMENT, INQUIRY_PRACTICE_DETAILS, etc.) and extracts their reason for visit (cleaning, pain, checkup, emergency). Updates conversationState.intent and conversationState.reasonForVisit. This tool MUST be called as the very first tool for any initial meaningful user utterance that goes beyond simple greetings. This tool is silent - it does not speak to the user and the backend will provide the first conversational response after analysis is complete.",
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
    if (lowerUtterance.includes("book") || lowerUtterance.includes("schedule") || lowerUtterance.includes("appointment") || 
        lowerUtterance.includes("make an appointment") || lowerUtterance.includes("set up") || lowerUtterance.includes("arrange")) {
      // Check for specific booking contexts
      if (lowerUtterance.includes("new patient") || lowerUtterance.includes("first time") || lowerUtterance.includes("never been") ||
          lowerUtterance.includes("first visit") || lowerUtterance.includes("new to") || lowerUtterance.includes("haven't been")) {
        determinedIntent = "NEW_PATIENT_BOOKING";
        conversationState.updatePatientStatus('new');
      } else if (lowerUtterance.includes("existing") || lowerUtterance.includes("current patient") || lowerUtterance.includes("been there before") ||
                 lowerUtterance.includes("been here before") || lowerUtterance.includes("return patient") || lowerUtterance.includes("established patient")) {
        determinedIntent = "EXISTING_PATIENT_BOOKING";
        conversationState.updatePatientStatus('existing');
      } else {
        // General booking intent - patient status to be determined later
        determinedIntent = "BOOK_APPOINTMENT";
      }
    } else if (lowerUtterance.includes("reschedule") || lowerUtterance.includes("change") || lowerUtterance.includes("move my appointment") ||
               lowerUtterance.includes("switch") || lowerUtterance.includes("different time") || lowerUtterance.includes("different date")) {
      determinedIntent = "RESCHEDULE_APPOINTMENT";
    } else if (lowerUtterance.includes("cancel") || lowerUtterance.includes("delete") || lowerUtterance.includes("remove my appointment")) {
      determinedIntent = "CANCEL_APPOINTMENT";
    } else if (lowerUtterance.includes("hours") || lowerUtterance.includes("location") || lowerUtterance.includes("address") || 
               lowerUtterance.includes("directions") || lowerUtterance.includes("where are you") || lowerUtterance.includes("how to get") ||
               lowerUtterance.includes("what time") || lowerUtterance.includes("when are you open") || lowerUtterance.includes("parking")) {
      determinedIntent = "INQUIRY_PRACTICE_DETAILS";
    } else if (lowerUtterance.includes("insurance") || lowerUtterance.includes("cost") || lowerUtterance.includes("price") || 
               lowerUtterance.includes("payment") || lowerUtterance.includes("fee") || lowerUtterance.includes("charge") ||
               lowerUtterance.includes("how much") || lowerUtterance.includes("accept") || lowerUtterance.includes("covered")) {
      determinedIntent = "INQUIRY_FINANCIAL";
    }

    // Enhanced reason for visit extraction - expanded keyword coverage
    const painKeywords = ["pain", "ache", "hurts", "hurt", "toothache", "sore", "throb", "sensitive", "throbbing", "sharp pain", "stabbing"];
    const cleaningKeywords = ["cleaning", "clean", "hygiene", "polish", "prophylaxis", "deep clean", "scale"];
    const checkupKeywords = ["check-up", "checkup", "exam", "examination", "check up", "routine", "recall", "six month", "regular visit"];
    const emergencyKeywords = ["emergency", "urgent", "broke", "broken", "chip", "chipped", "fell out", "lost filling", "swollen", "bleeding"];
    const cosmeticKeywords = ["whitening", "whiten", "cosmetic", "veneers", "smile", "bleach", "brightening", "aesthetic"];
    const restorationKeywords = ["filling", "crown", "root canal", "extraction", "pull", "remove", "cavity", "decay", "bridge", "implant"];
    const orthodonticKeywords = ["braces", "orthodontic", "straighten", "invisalign", "retainer", "bite"];
    const preventiveKeywords = ["fluoride", "sealant", "x-ray", "xray", "screening"];

    // Extract reason for visit based on keywords
    const reasonKeywords = [
      { keywords: painKeywords, reason: "pain" },
      { keywords: emergencyKeywords, reason: "emergency" }, // Check emergency before other categories
      { keywords: cleaningKeywords, reason: "cleaning" },
      { keywords: checkupKeywords, reason: "checkup" },
      { keywords: cosmeticKeywords, reason: "cosmetic treatment" },
      { keywords: restorationKeywords, reason: "dental restoration" },
      { keywords: orthodonticKeywords, reason: "orthodontic treatment" },
      { keywords: preventiveKeywords, reason: "preventive care" }
    ];

    for (const { keywords, reason } of reasonKeywords) {
      for (const keyword of keywords) {
        if (lowerUtterance.includes(keyword)) {
          determinedReason = reason;
          
          // Refine intent based on reason
          if (!determinedIntent && (reason === "pain" || reason === "emergency")) {
            determinedIntent = "URGENT_BOOKING";
          } else if (!determinedIntent && (reason === "cleaning" || reason === "checkup" || reason === "preventive care")) {
            determinedIntent = "ROUTINE_BOOKING";
          } else if (!determinedIntent && (reason === "cosmetic treatment" || reason === "orthodontic treatment")) {
            determinedIntent = "ELECTIVE_BOOKING";
          }
          break;
        }
      }
      if (determinedReason) break; // Stop after first match
    }

    // Enhanced fallback intent detection for appointment-related utterances
    if (!determinedIntent) {
      // Check for implicit booking language
      if (determinedReason || lowerUtterance.includes("need") || lowerUtterance.includes("want") || lowerUtterance.includes("looking for")) {
        if (lowerUtterance.includes("see") || lowerUtterance.includes("visit") || lowerUtterance.includes("come in") ||
            lowerUtterance.includes("appointment") || lowerUtterance.includes("dentist") || lowerUtterance.includes("dr ") ||
            lowerUtterance.includes("doctor")) {
          determinedIntent = "BOOK_APPOINTMENT";
        }
      }
      
      // Check for availability inquiry (often precedes booking)
      if (lowerUtterance.includes("available") || lowerUtterance.includes("free") || lowerUtterance.includes("open") ||
          lowerUtterance.includes("slot") || lowerUtterance.includes("time")) {
        if (lowerUtterance.includes("today") || lowerUtterance.includes("tomorrow") || lowerUtterance.includes("this week") ||
            lowerUtterance.includes("next week") || /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lowerUtterance)) {
          determinedIntent = "CHECK_AVAILABILITY";
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
        utterance_analyzed: utterance,
        patientStatus: conversationState.patientStatus // Include current patient status for dynamic message generation
      }
    };
  }
};

export default getIntentTool; 