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

  // For this isolated test, directly use args.userRawRequest.
  const userRequestForApptType = args.userRawRequest.trim();
  addLogEntry({ event: "DIRECT_SERVICE_INQUIRY_FOR_APPT_TYPE_MATCH", source: "findAppointmentTypeHandler", details: { requestToMatch: userRequestForApptType } }, vapiCallId);

  if (!userRequestForApptType || userRequestForApptType.trim() === "") {
      state.setCurrentStage("error_empty_service_request_for_appt_type");
      return { 
          success: false, 
          outputData: { 
              matchFound: false,
              messageForAssistant: "I didn't quite catch what service you're looking for. Could you please tell me again?"
          }, 
          error: "EMPTY_SERVICE_REQUEST" 
      };
  }

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
  const llmMatchResult = await performLLMMatch(userRequestForApptType, dbTypesForMatcher, vapiCallId);

  if (!llmMatchResult.matched || !llmMatchResult.laineAppointmentTypeId) {
    state.setCurrentStage("appointment_type_match_failed");
    addLogEntry({ event: "AI_HANDLER_INFO", source: "findAppointmentTypeHandler.processFindAppointmentType", details: { info: "LLM did not find a confident match.", llmReasoning: llmMatchResult.reasoning } }, vapiCallId);
    return { success: true, outputData: { matchFound: false, messageForAssistant: `I couldn't find a specific service for "${userRequestForApptType}". Could you describe it a bit differently, or would you like to hear some common services we offer?` }, error: "NO_MATCH_FOUND" };
  }

  // 3. Fetch full details for the matched Laine AppointmentType
  const matchedLaineApptId = llmMatchResult.laineAppointmentTypeId;
  const fullMatchedApptType = await prisma.appointmentType.findUnique({
      where: { id: matchedLaineApptId },
  });

  if (!fullMatchedApptType) {
      addLogEntry({ event: "AI_HANDLER_ERROR", source: "findAppointmentTypeHandler", details: { error: "LLM matched Laine ID not found in DB.", matchedId: matchedLaineApptId } }, vapiCallId);
      state.setCurrentStage("appointment_type_internal_error");
      return { success: false, outputData: { matchFound: false, messageForAssistant: "I had trouble looking up the details for that service. Could you try again?" }, error: "INTERNAL_DB_MATCH_ERROR" };
  }

  if (!fullMatchedApptType.nexhealthAppointmentTypeId) {
      addLogEntry({ event: "AI_HANDLER_ERROR", source: "findAppointmentTypeHandler", details: { error: "Matched Laine AppointmentType is missing NexHealth ID.", laineApptId: matchedLaineApptId, apptName: fullMatchedApptType.name } }, vapiCallId);
      state.setCurrentStage("appointment_type_config_error_nexhealth_id");
      return { success: false, outputData: { matchFound: true, matchedAppointmentName: fullMatchedApptType.name, messageForAssistant: `The service "${fullMatchedApptType.name}" isn't fully configured for online booking. Please contact the office.` }, error: "MISSING_NEXHEALTH_APPT_ID_CONFIG" };
  }

  // 4. Find associated active NexHealth Provider ID(s)
  // Step 1: Find which SavedProvider entities are linked to this Laine Appointment Type
  const providerAcceptances = await prisma.providerAcceptedAppointmentType.findMany({
    where: { appointmentTypeId: fullMatchedApptType.id },
    select: { savedProviderId: true }
  });

  if (providerAcceptances.length === 0) {
    // This case is handled by the next check returning no provider IDs.
  }

  const savedProviderIds = providerAcceptances.map(pa => pa.savedProviderId);

  // Step 2: From those SavedProviders, find the ones that are active and have a valid NexHealth Provider ID.
  const activeProviders = await prisma.savedProvider.findMany({
    where: {
        id: { in: savedProviderIds },
        isActive: true,
        provider: {
            nexhealthProviderId: {
                not: ''
            }
        }
    },
    select: {
        provider: {
            select: {
                nexhealthProviderId: true
            }
        }
    }
  });


  const activeNexhealthProviderIds = activeProviders
      .map(p => p.provider.nexhealthProviderId)
      .filter(id => id) as string[];


  if (activeNexhealthProviderIds.length === 0) {
      state.setCurrentStage("appointment_type_no_provider_found");
      addLogEntry({ event: "AI_HANDLER_ERROR", source: "findAppointmentTypeHandler", details: { error: "No active providers with NexHealth IDs found for matched appointment type.", matchedLaineApptId: fullMatchedApptType.id, apptName: fullMatchedApptType.name } }, vapiCallId);
      return { 
          success: false, // Or true if we want to inform the user but not treat as hard error for the tool
          outputData: { 
              matchFound: true, 
              matchedAppointmentName: fullMatchedApptType.name,
              matchedAppointmentDuration: fullMatchedApptType.duration,
              messageForAssistant: `I found the service "${fullMatchedApptType.name}", but it seems we can't book it online right now as no specific provider is available. Please contact the office for assistance.`
          }, 
          error: "NO_PROVIDER_FOR_APPOINTMENT_TYPE" 
      };
  }
  const targetNexhealthProviderId = activeNexhealthProviderIds[0]; // Take the first one

  // 5. Update ConversationState
  state.matchedLaineAppointmentTypeId = fullMatchedApptType.id;
  state.matchedNexhealthAppointmentTypeId = fullMatchedApptType.nexhealthAppointmentTypeId;
  state.matchedAppointmentName = fullMatchedApptType.name;
  state.matchedAppointmentDuration = fullMatchedApptType.duration;
  state.targetNexhealthProviderId = targetNexhealthProviderId; // CRITICAL
  state.setCurrentStage("appointment_type_identified_with_provider");

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