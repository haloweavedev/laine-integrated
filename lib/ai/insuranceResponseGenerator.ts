import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { CoreMessage } from "ai";

/**
 * Generates a natural, helpful, and context-aware response based on insurance query results.
 * Handles three scenarios: general inquiry, specific inquiry with match, and specific inquiry without match.
 * @param isMatch Whether the specific insurance plan was found in accepted insurances
 * @param queriedInsurance The specific insurance plan the user asked about (null for general inquiries)
 * @param acceptedInsurances Array of insurance plans that the practice accepts
 * @returns A promise that resolves to a natural response string
 */
export async function generateInsuranceResponse(
  isMatch: boolean, 
  queriedInsurance: string | null, 
  acceptedInsurances: string[]
): Promise<string> {
  try {
    const systemPrompt = `You are an AI assistant crafting a response for a dental receptionist. Your tone should be helpful and clear. Based on the scenario, generate a single, fluid response.

**Scenario A: General Inquiry**
The user asked what insurances you accept.
Your task: List the following accepted plans in a natural sentence.
Accepted Plans: {{acceptedInsurances}}
Example: "We accept several major plans, including Cigna, Delta Dental, and MetLife."

**Scenario B: Specific Inquiry - Match Found**
The user asked if you accept a specific insurance, and you do.
Your task: Confirm that you accept their plan.
User's Plan: {{queriedInsurance}}
Example: "Yes, we do accept Cigna! We're in-network with them."

**Scenario C: Specific Inquiry - No Match**
The user asked if you accept a specific insurance, and you do not.
Your task: Deliver a reassuring, empathetic response that doesn't alienate the patient or list other plans.
User's Plan: {{queriedInsurance}}
Example: "It looks like we may be out-of-network with that plan, but we'd still love to take care of you."`;

    let userMessage: string;
    
    if (queriedInsurance === null) {
      // Scenario A: General Inquiry
      userMessage = `The user asked what insurances you accept. List these accepted plans naturally: ${acceptedInsurances.join(', ')}`;
    } else if (isMatch) {
      // Scenario B: Specific Inquiry - Match Found
      userMessage = `The user asked if you accept ${queriedInsurance}. Confirm that you do accept this plan.`;
    } else {
      // Scenario C: Specific Inquiry - No Match
      userMessage = `The user asked if you accept ${queriedInsurance}. You do NOT accept this plan. Deliver a reassuring, empathetic response that doesn't alienate them or list other plans.`;
    }

    const messages: CoreMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages,
      temperature: 0.2,
      maxTokens: 150,
    });

    return text.trim();

  } catch (error) {
    console.error(`[InsuranceResponseGenerator] Error generating response for queriedInsurance: "${queriedInsurance}", isMatch: ${isMatch}`, error);
    
    // Safe fallback response
    if (queriedInsurance === null) {
      return acceptedInsurances.length > 0 
        ? `We accept ${acceptedInsurances.join(', ')}.`
        : "I'm sorry, I don't have the list of accepted insurances available right now, but our office staff can certainly help with that.";
    } else if (isMatch) {
      return `Yes, we do accept ${queriedInsurance}!`;
    } else {
      return `It looks like we may be out-of-network with ${queriedInsurance}, but we'd still love to take care of you.`;
    }
  }
} 