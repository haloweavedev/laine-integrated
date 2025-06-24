import { ConversationState } from "@/lib/conversationState";
import { ParsedFindAppointmentTypeArgs } from "@/lib/tools/findAppointmentType";
import { prisma } from "@/lib/prisma";
import { addLogEntry } from "@/lib/debugLogStore";
import { generateText } from 'ai'; // Assuming 'ai' SDK is used
import { openai } from '@ai-sdk/openai';     // Assuming OpenAI

// Define necessary types, potentially in a shared lib/ai/types.ts later
interface PracticeInfoForAppointmentFinding {
    id: string; // Practice ID
    name: string; // Practice Name
    // We'll fetch appointment types directly in this handler using practiceId
}

interface DbAppointmentTypeForMatcher {
    id: string; // Laine CUID for the AppointmentType
    name: string;
    keywords?: string | null;
    nexhealthAppointmentTypeId: string; // NexHealth ID
    duration: number;
}

interface LLMMatchResult {
    matched: boolean;
    laineAppointmentTypeId?: string; // Laine CUID of the matched AppointmentType
    reasoning?: string;
}

export interface FindAppointmentTypeResult {
  success: boolean;
  outputData: {
    messageForAssistant?: string; // To be populated by messageGenerator
    matchFound: boolean;
    matchedLaineAppointmentTypeId?: string | null;
    matchedNexhealthAppointmentTypeId?: string | null;
    matchedAppointmentName?: string | null;
    matchedAppointmentDuration?: number | null;
    targetNexhealthProviderId?: string | null; // For createNewPatient and booking
    // Add any other data needed by message generator or subsequent tools
  };
  error?: string;
}

async function performLLMMatch(
    userRequest: string,
    availableTypes: DbAppointmentTypeForMatcher[],
    vapiCallId: string
): Promise<LLMMatchResult> {
    const typesForPrompt = availableTypes.map(t => ({
        id: t.id, // Laine CUID
        name: t.name,
        keywords: t.keywords || "general dental service",
    }));

    const systemPrompt = `You are an expert AI assistant helping a dental receptionist match patient requests to available appointment types.
Analyze the patient's request and find the BEST matching appointment type from the practice's list.
Patient's request: "${userRequest}"
Available appointment types (with their internal Laine IDs):
${JSON.stringify(typesForPrompt, null, 2)}

Respond with ONLY a JSON object matching this exact structure:
{
  "matched": boolean, // true if a confident match is found, false otherwise
  "laineAppointmentTypeId": "string_or_null", // The Laine CUID of the matched type, or null
  "reasoning": "brief explanation of your matching decision"
}
Prioritize exact name matches, then strong keyword matches. If uncertain, set matched to false.`;

    addLogEntry({ event: "LLM_MATCH_START", source: "findAppointmentTypeHandler.performLLMMatch", details: { userRequest, typesCount: availableTypes.length, promptSnippet: systemPrompt.substring(0, 200) } }, vapiCallId);

    try {
        const { text } = await generateText({
            model: openai(process.env.OPENAI_API_MODEL || 'gpt-4o-mini'), // Use configured model
            messages: [{ role: 'system', content: systemPrompt }],
            temperature: 0.2,
            maxTokens: 150,
        });
        const parsedResponse = JSON.parse(text) as LLMMatchResult;
        addLogEntry({ event: "LLM_MATCH_SUCCESS", source: "findAppointmentTypeHandler.performLLMMatch", details: { response: parsedResponse } }, vapiCallId);
        return parsedResponse;
    } catch (error) {
        console.error("LLM matching error:", error);
        addLogEntry({ event: "LLM_MATCH_ERROR", source: "findAppointmentTypeHandler.performLLMMatch", details: { error: error instanceof Error ? error.message : String(error) } }, vapiCallId);
        return { matched: false, reasoning: "LLM matching failed." };
    }
}

export async function processFindAppointmentType(
  args: ParsedFindAppointmentTypeArgs,
  state: ConversationState,
  practiceInfo: PracticeInfoForAppointmentFinding,
  vapiCallId: string
): Promise<FindAppointmentTypeResult> {
  addLogEntry({
    event: "AI_HANDLER_START",
    source: "findAppointmentTypeHandler.processFindAppointmentType",
    details: { args, practiceId: practiceInfo.id, initialState: state.getStateSnapshot() }
  }, vapiCallId);

  const userRequest = args.userRawRequest;

  // 1. Fetch appointment types for the practice from DB
  const practiceAppointmentTypes = await prisma.appointmentType.findMany({
    where: {
      practiceId: practiceInfo.id,
    },
    select: {
      id: true, // This is the Laine CUID
      name: true,
      keywords: true,
      nexhealthAppointmentTypeId: true,
      duration: true,
    }
  });

  if (!practiceAppointmentTypes || practiceAppointmentTypes.length === 0) {
    addLogEntry({ event: "AI_HANDLER_ERROR", source: "findAppointmentTypeHandler.processFindAppointmentType", details: { error: "No active appointment types found for practice." } }, vapiCallId);
    return { success: false, outputData: { matchFound: false }, error: "NO_APPOINTMENT_TYPES_CONFIGURED" };
  }
  
  const dbTypesForMatcher: DbAppointmentTypeForMatcher[] = practiceAppointmentTypes.map(t => ({
      id: t.id,
      name: t.name,
      keywords: t.keywords,
      nexhealthAppointmentTypeId: t.nexhealthAppointmentTypeId, // Ensure this is not null/empty
      duration: t.duration,
  })).filter(t => t.nexhealthAppointmentTypeId); // Only include types with a NexHealth ID

  if (dbTypesForMatcher.length === 0) {
    addLogEntry({ event: "AI_HANDLER_ERROR", source: "findAppointmentTypeHandler.processFindAppointmentType", details: { error: "No appointment types with NexHealth IDs found for matching." } }, vapiCallId);
    return { success: false, outputData: { matchFound: false }, error: "NO_NEXHEALTH_MAPPED_APPOINTMENT_TYPES" };
  }

  // 2. Perform LLM Matching
  const llmMatchResult = await performLLMMatch(userRequest, dbTypesForMatcher, vapiCallId);

  if (!llmMatchResult.matched || !llmMatchResult.laineAppointmentTypeId) {
    state.setCurrentStage("appointment_type_match_failed");
    addLogEntry({ event: "AI_HANDLER_INFO", source: "findAppointmentTypeHandler.processFindAppointmentType", details: { info: "LLM did not find a confident match.", llmReasoning: llmMatchResult.reasoning } }, vapiCallId);
    return { success: true, outputData: { matchFound: false, messageForAssistant: `I couldn't find a specific service for "${userRequest}". Could you describe it a bit differently, or would you like to hear some common services we offer?` }, error: "NO_MATCH_FOUND" };
  }

  const matchedDbEntry = dbTypesForMatcher.find(t => t.id === llmMatchResult.laineAppointmentTypeId);
  if (!matchedDbEntry) {
    state.setCurrentStage("appointment_type_match_error_internal");
    addLogEntry({ event: "AI_HANDLER_ERROR", source: "findAppointmentTypeHandler.processFindAppointmentType", details: { error: "LLM matched an ID not in our DB list.", matchedId: llmMatchResult.laineAppointmentTypeId } }, vapiCallId);
    return { success: false, outputData: { matchFound: false }, error: "INTERNAL_MATCH_ERROR" };
  }

  // 3. Find associated NexHealth Provider ID(s)
  // Logic similar to scripts/debug-appointment-type-providers.js
  const providerAcceptances = await prisma.providerAcceptedAppointmentType.findMany({
    where: {
      appointmentTypeId: matchedDbEntry.id, // Use Laine CUID
      savedProvider: {
        isActive: true, // Only active providers
        provider: {
            nexhealthProviderId: { not: "" } // Ensure provider has a NexHealth ID
        }
      }
    },
    include: {
      savedProvider: {
        include: {
          provider: {
            select: { nexhealthProviderId: true }
          }
        }
      }
    }
  });

  const activeNexhealthProviderIds = providerAcceptances
    .map(pa => pa.savedProvider.provider.nexhealthProviderId)
    .filter(id => id != null) as string[];

  if (activeNexhealthProviderIds.length === 0) {
    state.setCurrentStage("appointment_type_no_provider");
    addLogEntry({ event: "AI_HANDLER_ERROR", source: "findAppointmentTypeHandler.processFindAppointmentType", details: { error: "No active providers configured for matched appointment type.", matchedType: matchedDbEntry.name } }, vapiCallId);
    return { success: false, outputData: { matchFound: true, matchedAppointmentName: matchedDbEntry.name }, error: "NO_PROVIDER_FOR_APPOINTMENT_TYPE" };
  }
  
  const targetNexhealthProviderId = activeNexhealthProviderIds[0]; // Select the first active one for now

  // 4. Update ConversationState
  state.matchedLaineAppointmentTypeId = matchedDbEntry.id;
  state.matchedNexhealthAppointmentTypeId = matchedDbEntry.nexhealthAppointmentTypeId;
  state.matchedAppointmentName = matchedDbEntry.name;
  state.matchedAppointmentDuration = matchedDbEntry.duration;
  state.targetNexhealthProviderId = targetNexhealthProviderId;
  state.setCurrentStage("appointment_type_identified");

  addLogEntry({
    event: "AI_HANDLER_STATE_UPDATED",
    source: "findAppointmentTypeHandler.processFindAppointmentType",
    details: { finalState: state.getStateSnapshot() }
  }, vapiCallId);

  return {
    success: true,
    outputData: {
      matchFound: true,
      matchedLaineAppointmentTypeId: state.matchedLaineAppointmentTypeId,
      matchedNexhealthAppointmentTypeId: state.matchedNexhealthAppointmentTypeId,
      matchedAppointmentName: state.matchedAppointmentName,
      matchedAppointmentDuration: state.matchedAppointmentDuration,
      targetNexhealthProviderId: state.targetNexhealthProviderId,
      // messageForAssistant will be populated by messageGenerator
    },
  };
} 