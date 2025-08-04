import { prisma } from '@/lib/prisma';
import { generateInsuranceResponse } from '@/lib/ai/insuranceResponseGenerator';
import type { HandlerResult } from '@/types/vapi';
import type { ConversationState } from '@/types/laine';

interface InsuranceInfoArgs {
  insuranceName?: string;
}

/**
 * Handles the insuranceInfo tool call
 * Fetches practice insurance data and generates appropriate responses for general or specific insurance queries
 * @param currentState Current conversation state
 * @param args Tool arguments containing optional insuranceName
 * @param toolCallId ID of the tool call for response tracking
 * @returns HandlerResult with generated insurance response
 */
export async function handleInsuranceInfo(
  currentState: ConversationState,
  args: InsuranceInfoArgs,
  toolCallId: string
): Promise<HandlerResult> {
  console.log(`[InsuranceInfoHandler] Processing query for insurance: "${args.insuranceName || 'general inquiry'}"`);

  try {
    if (!currentState.practiceId) {
      return {
        toolResponse: {
          toolCallId,
          error: "Practice configuration not found."
        },
        newState: currentState
      };
    }

    // Fetch practice insurance information
    const practice = await prisma.practice.findUnique({
      where: { id: currentState.practiceId },
      select: {
        acceptedInsurances: true
      }
    });

    if (!practice) {
      return {
        toolResponse: {
          toolCallId,
          error: "Practice not found."
        },
        newState: currentState
      };
    }

    // Handle case where no insurance data is available
    if (!practice.acceptedInsurances || practice.acceptedInsurances.trim() === '') {
      return {
        toolResponse: {
          toolCallId,
          result: { success: true },
          message: {
            type: "request-complete",
            role: "assistant",
            content: "I'm sorry, I don't have the list of accepted insurances available right now, but our office staff can certainly help with that."
          }
        },
        newState: currentState
      };
    }

    // Parse the comma-separated string into an array of trimmed strings
    const insurancesArray = practice.acceptedInsurances
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    let isMatch = false;
    let queriedInsurance: string | null = null;

    // Check if a specific insurance was queried
    if (args.insuranceName) {
      queriedInsurance = args.insuranceName;
      // Perform case-insensitive search
      isMatch = insurancesArray.some(insurance => 
        insurance.toLowerCase() === args.insuranceName!.toLowerCase()
      );
    }

    // Generate AI-powered response
    const aiResponse = await generateInsuranceResponse(isMatch, queriedInsurance, insurancesArray);

    console.log(`[InsuranceInfoHandler] Generated response for insurance query`);

    return {
      toolResponse: {
        toolCallId,
        result: { success: true },
        message: {
          type: "request-complete",
          role: "assistant",
          content: aiResponse
        }
      },
      newState: currentState
    };

  } catch (error) {
    console.error('[InsuranceInfoHandler] Error processing insurance query:', error);
    return {
      toolResponse: {
        toolCallId,
        error: "I'm sorry, I'm having trouble accessing our insurance information right now. Please contact our office directly for assistance with insurance questions."
      },
      newState: currentState
    };
  }
} 