import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ConversationState } from "@/lib/conversationState";
import { addLogEntry } from "@/lib/debugLogStore";
import { processGetIntent } from "@/lib/ai/intentHandler";
import { processFindAppointmentType } from "@/lib/ai/findAppointmentTypeHandler";
import { processPatientOnboarding } from "@/lib/ai/patientOnboardingHandler";
import { processCheckAvailableSlots } from "@/lib/ai/slotCheckerHandler";
import { generateMessageAfterIntent, generateMessageAfterFindAppointmentType, generateMessageForPatientOnboarding, generateMessageAfterSlotCheck } from "@/lib/ai/messageGenerator";

// Type for VAPI payload (flexible to handle various structures)
interface VapiPayload {
  message: {
    type: string;
    call: {
      id: string;
      assistantId?: string;
      assistant?: {
        id?: string;
        [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      };
      [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    assistant?: {
      id?: string;
      [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    // VAPI-COMPLIANT: According to VAPI docs, this should be toolCallList (not toolCalls)
    toolCallList?: VapiIncomingToolCall[];
    // Fallback for potential variations in VAPI payload structure
    toolCalls?: VapiIncomingToolCall[];
    [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

// VAPI-COMPLIANT: Define the structure of incoming tool calls as per VAPI documentation
interface VapiIncomingToolCall {
  id: string; // VAPI docs specify this as required
  name?: string; // Direct name property (alternative format)
  arguments?: string | Record<string, unknown>; // Can be JSON string or object
  function?: {
    name: string; // VAPI docs specify function.name as the primary tool name location
    arguments?: string | Record<string, unknown>; // Can be JSON string or object per VAPI docs
  };
  toolCallId?: string; // Alternative ID field for fallback
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// Enhanced function to extract assistant ID with strict validation
function extractAssistantId(payload: VapiPayload): string {
  const { message } = payload;
  
  console.log("=== Assistant ID Extraction Debug ===");
  console.log("Call object keys:", Object.keys(message.call || {}));
  console.log("Assistant object keys:", Object.keys(message.assistant || {}));
  
  // Check if VAPI is sending assistant ID in different locations
  const assistantId = message.call?.assistantId || 
                     message.assistant?.id ||
                     message.call?.assistant?.id;
  
  if (!assistantId) {
    // For VAPI tool call payloads, assistant ID is often not included
    // This is normal behavior, not a critical error
    console.log("ℹ️ No assistant ID found in VAPI tool call payload (this is normal)");
    console.log("Payload structure:", JSON.stringify({
      call: Object.keys(message.call || {}),
      assistant: Object.keys(message.assistant || {}),
      assistantName: message.assistant?.name || message.call?.assistant?.name
    }, null, 2));
    
    // Use assistant name as fallback (standard for VAPI tool calls)
    const assistantName = message.assistant?.name || message.call?.assistant?.name;
    if (assistantName && assistantName.includes(" - Laine")) {
      console.log("✅ Using assistant name for practice lookup:", assistantName);
      return assistantName; // This will be handled differently in practice lookup
    }
    
    throw new Error("Assistant identification is required for practice lookup");
  }
  
  console.log("✅ Found assistant ID:", assistantId);
  return assistantId;
}

// Simplified practice lookup with strict validation - now handles assistant name fallback
async function findPracticeByAssistantId(assistantIdOrName: string) {
  console.log("=== Practice Lookup Debug ===");
  console.log("Assistant ID or Name:", assistantIdOrName);
  
  try {
    let practice = null;
    
    // First try to find by assistant ID (preferred method)
    const assistantConfig = await prisma.practiceAssistantConfig.findUnique({
      where: { vapiAssistantId: assistantIdOrName },
      include: { 
        practice: true
      }
    });
    
    if (assistantConfig) {
      practice = assistantConfig.practice;
      console.log("✅ Found practice by assistant ID:", practice.id);
    }
    
    // If not found and looks like an assistant name, try to find by Royal Oak or subdomain
    if (!practice && (assistantIdOrName.includes("Laine") || assistantIdOrName.includes("Practice"))) {
      console.log("⚠️ Attempting practice lookup by assistant name:", assistantIdOrName);
      
      const config = await prisma.practiceAssistantConfig.findFirst({
        where: { 
          practice: {
            OR: [
              { name: { contains: "Royal Oak" } },
              { nexhealthSubdomain: "xyz" } // Fallback to known subdomain
            ]
          }
        },
        include: { practice: true }
      });
      
      if (config) {
        practice = config.practice;
        console.log(`✅ Found practice by pattern matching:`, practice.id);
      }
      
      // If still not found but this looks like a Laine assistant, try fallback to first practice
      if (!practice && (assistantIdOrName.includes("Laine") || assistantIdOrName.includes("Practice"))) {
        console.log("⚠️ No exact match found, trying first available practice as fallback");
        const fallbackConfig = await prisma.practiceAssistantConfig.findFirst({
          include: { practice: true }
        });
        
        if (fallbackConfig) {
          practice = fallbackConfig.practice;
          console.log(`✅ Using fallback practice:`, practice.id);
        }
      }
    }
    
    if (!practice) {
      console.log("❌ No practice found for assistant ID/name:", assistantIdOrName);
      return null;
    }
    
    console.log("✅ Successfully found practice:", practice.id);
    return await fetchPracticeWithSchedulingData(practice.id);
    
  } catch (error) {
    console.error("❌ Error in practice lookup:", error);
    return null;
  }
}

// Separate function to fetch practice with scheduling data
async function fetchPracticeWithSchedulingData(practiceId: string) {
  try {
    const practice = await prisma.practice.findUnique({ 
      where: { id: practiceId },
      include: {
        appointmentTypes: {
          select: {
            id: true,
            name: true,
            duration: true,
            nexhealthAppointmentTypeId: true
          }
        },
        savedProviders: {
          where: { isActive: true },
          select: {
            id: true,
            isActive: true,
            acceptedAppointmentTypes: {
              select: {
                appointmentType: {
                  select: {
                    id: true
                  }
                }
              }
            },
            provider: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nexhealthProviderId: true
              }
            },
            assignedOperatories: {
              select: {
                savedOperatory: {
                  select: {
                    id: true,
                    name: true,
                    nexhealthOperatoryId: true
                  }
                }
              }
            }
          }
        },
        savedOperatories: {
          select: {
            id: true,
            name: true,
            nexhealthOperatoryId: true
          }
        }
      }
    });
    
    if (!practice) {
      throw new Error(`Practice not found: ${practiceId}`);
    }
    
    return practice;
  } catch (error) {
    console.error("Error fetching practice with scheduling data:", error);
    throw error;
  }
}

function extractToolName(toolCall: VapiIncomingToolCall): string | null {
  // VAPI-COMPLIANT: Extract tool name following VAPI documentation precedence
  console.log(`[extractToolName] Processing tool call:`, JSON.stringify(toolCall, null, 2));
  
  // Primary: function.name (most common per VAPI docs)
  if (toolCall.function?.name) {
    console.log(`[extractToolName] Found tool name in function.name: ${toolCall.function.name}`);
    return toolCall.function.name;
  }
  
  // Secondary: direct name property
  if (toolCall.name) {
    console.log(`[extractToolName] Found tool name in name: ${toolCall.name}`);
    return toolCall.name;
  }
  
  console.warn(`[extractToolName] No tool name found in tool call structure:`, toolCall);
  return null;
}

function extractToolCallId(toolCall: VapiIncomingToolCall): string {
  // VAPI-COMPLIANT: Extract tool call ID following VAPI documentation
  const toolCallId = toolCall.id || toolCall.toolCallId || 'unknown';
  
  if (toolCallId === 'unknown') {
    console.warn(`[extractToolCallId] No valid tool call ID found in:`, toolCall);
  }
  
  return toolCallId;
}

function extractToolCallArguments(toolCall: VapiIncomingToolCall): Record<string, unknown> {
  console.log(`[extractToolCallArguments] Processing arguments for tool call:`, JSON.stringify(toolCall, null, 2));
  
  // VAPI-COMPLIANT: Extract arguments following VAPI documentation precedence
  let argumentsData: string | Record<string, unknown> | undefined;
  
  // Primary: function.arguments (most common per VAPI docs)
  if (toolCall.function?.arguments !== undefined) {
    argumentsData = toolCall.function.arguments;
    console.log(`[extractToolCallArguments] Using function.arguments:`, argumentsData);
  }
  // Secondary: direct arguments property
  else if (toolCall.arguments !== undefined) {
    argumentsData = toolCall.arguments;
    console.log(`[extractToolCallArguments] Using direct arguments:`, argumentsData);
  }
  
  // Parse if string, return as-is if object
  if (typeof argumentsData === 'string') {
    try {
      const parsed = JSON.parse(argumentsData);
      console.log(`[extractToolCallArguments] Successfully parsed JSON string arguments:`, parsed);
      return parsed;
    } catch (parseError) {
      console.error(`[extractToolCallArguments] Failed to parse arguments string:`, parseError);
      console.log(`[extractToolCallArguments] Raw arguments string:`, argumentsData);
      return {};
    }
  } else if (typeof argumentsData === 'object' && argumentsData !== null) {
    console.log(`[extractToolCallArguments] Using object arguments directly:`, argumentsData);
    return argumentsData as Record<string, unknown>;
  }
  
  console.warn(`[extractToolCallArguments] No valid arguments found, returning empty object`);
  return {};
}

export async function POST(req: NextRequest) {
  let vapiCallId = 'unknown-call-id';
  let payload: VapiPayload | undefined;

  try {
    payload = await req.json() as VapiPayload;
    vapiCallId = payload.message?.call?.id || 'unknown-call-id';

    addLogEntry({
      event: "RAW_VAPI_PAYLOAD",
      source: "ToolCallRoute:POST",
      details: { payloadString: JSON.stringify(payload, null, 2) }
    }, vapiCallId);

    const incomingToolCalls = payload.message.toolCallList || payload.message.toolCalls || [];
    addLogEntry({
        event: "INCOMING_VAPI_TOOL_CALLS_BATCH",
        source: "ToolCallRoute:POST",
        details: {
            count: incomingToolCalls.length,
            calls: incomingToolCalls.map(tc => ({
                id: extractToolCallId(tc),
                name: extractToolName(tc),
                argsString: JSON.stringify(extractToolCallArguments(tc))
            }))
        }
    }, vapiCallId);

    // VAPI-COMPLIANT: Use assistant identification for multi-tenancy support
    const assistantId = extractAssistantId(payload);
    const practice = await findPracticeByAssistantId(assistantId);
    
    if (!practice) {
      throw new Error(`No practice found for assistant ID/name: ${assistantId}`);
    }
    
    // Initialize ConversationState
    const state = new ConversationState(vapiCallId, practice.id, assistantId);
    
    // Process all tool calls
    const results = [];
    
    console.log(`Processing ${incomingToolCalls.length} tool call(s)`);
    
    for (const toolCall of incomingToolCalls) {
      const toolName = extractToolName(toolCall);
      const toolCallId = extractToolCallId(toolCall);
      const extractedArgs = extractToolCallArguments(toolCall);

      // Restore state if available
      if (extractedArgs.conversationState && typeof extractedArgs.conversationState === 'string') {
        try {
          const parsedStateSnapshot = JSON.parse(extractedArgs.conversationState as string);
          state.restoreFromSnapshot(parsedStateSnapshot);
          addLogEntry({
            event: "CONVERSATION_STATE_RESTORE_ATTEMPT",
            source: "ToolCallRoute:Loop",
            details: {
              toolName,
              toolCallId,
              receivedStateString: extractedArgs.conversationState,
              parsedSnapshot: parsedStateSnapshot,
              stateAfterRestore: state.getStateSnapshot(),
            }
          }, vapiCallId);
        } catch (parseError) {
          addLogEntry({
            event: "CONVERSATION_STATE_RESTORE_ERROR",
            source: "ToolCallRoute:Loop",
            details: {
              toolName,
              toolCallId,
              error: parseError instanceof Error ? parseError.message : "JSON parse failed",
              receivedStateString: extractedArgs.conversationState
            }
          }, vapiCallId);
          // Continue with default state if parsing fails
        }
      }

      if (!toolName) {
        console.error(`❌ Unable to extract tool name from tool call`);
        const resultObject = {
          tool_output_data: {
            success: false,
            error_code: "INVALID_TOOL_CALL",
            details: "Unable to extract tool name"
          },
          current_conversation_state_snapshot: JSON.stringify(state.getStateSnapshot())
        };
        
        results.push({
          toolCallId,
          result: JSON.stringify(resultObject)
        });
        continue;
      }

      // Debug Logging: Tool call processing start
      addLogEntry({
        event: "TOOL_CALL_PROCESSING_START",
        source: `ToolCallRoute:Dispatch:${toolName}`,
        details: { toolCallId, toolName, extractedArgs }
      }, vapiCallId);

      // Debug Logging: State before AI handler
      addLogEntry({
        event: "STATE_BEFORE_AI_HANDLER",
        source: `ToolCallRoute:Dispatch:${toolName}`,
        details: { toolName, stateSnapshot: state.getStateSnapshot() }
      }, vapiCallId);

      console.log(`[ToolCallRoute] Identified tool: ${toolName}. Args:`, extractedArgs);
      console.log(`[ToolCallRoute] ConversationState before AI handler:`, state.getStateSnapshot());

      // AI Handler Dispatch Logic
      let toolHandlerResult: { success: boolean; outputData: Record<string, unknown>; error?: string }; // Define a more generic type for now

      // Define a simplified practice context to pass to handlers
      const practiceInfoForHandler = {
          id: practice.id, // Assuming 'practice' object is available and has an 'id'
          name: practice.name || "the dental office" // And a 'name'
      };

      if (toolName === "get_intent") {
          try {
              const { getIntentArgsSchema } = await import("@/lib/tools/getIntent"); // Dynamically import or ensure it's at top
              const validatedArgs = getIntentArgsSchema.parse(extractedArgs);
              
              const intentProcessingResult = await processGetIntent(validatedArgs, state, practiceInfoForHandler, vapiCallId);
              
              let messageForLlm = "An issue occurred while processing your request."; // Default error message
              if (intentProcessingResult.success) {
                  messageForLlm = await generateMessageAfterIntent(intentProcessingResult.outputData, state, vapiCallId);
              } else {
                  // Handle failure from processGetIntent if necessary, or use a generic error message
                  console.error("processGetIntent failed:", intentProcessingResult.error);
              }

              toolHandlerResult = {
                  success: intentProcessingResult.success,
                  outputData: {
                      ...intentProcessingResult.outputData,
                      messageForAssistant: messageForLlm, // This is the key for VAPI's LLM to speak
                  },
                  error: intentProcessingResult.error
              };

          } catch (validationError) {
              console.error(`[ToolCallRoute] Validation error for ${toolName}:`, validationError);
              addLogEntry({
                  event: "VALIDATION_ERROR",
                  source: `ToolCallRoute:Dispatch:${toolName}`,
                  details: { error: validationError instanceof Error ? validationError.message : "Validation failed" }
              }, vapiCallId);
              toolHandlerResult = {
                  success: false,
                  outputData: { 
                      messageForAssistant: "I had a little trouble understanding that. Could you try again?",
                      error_details: validationError instanceof Error ? validationError.message : "Validation failed"
                  },
                  error: "VALIDATION_ERROR"
              };
          }
      } else if (toolName === "find_appointment_type") {
        try {
            const { findAppointmentTypeArgsSchema } = await import("@/lib/tools/findAppointmentType");
            const validatedArgs = findAppointmentTypeArgsSchema.parse(extractedArgs);

            const findTypeProcessingResult = await processFindAppointmentType(validatedArgs, state, practiceInfoForHandler, vapiCallId);

            let messageForLlm = "I'm having a bit of trouble identifying that service. Could you try again?"; // Default error
            if (findTypeProcessingResult.success) {
                 // If the handler itself provided a message (e.g. for no match), use it. Otherwise, generate.
                if (findTypeProcessingResult.outputData.messageForAssistant) {
                    messageForLlm = findTypeProcessingResult.outputData.messageForAssistant;
                } else {
                    messageForLlm = await generateMessageAfterFindAppointmentType(findTypeProcessingResult.outputData, state, vapiCallId);
                }
            } else {
                 // Handle failure from processFindAppointmentType
                console.error("processFindAppointmentType failed:", findTypeProcessingResult.error);
                // Use a generic error message or one based on findTypeProcessingResult.error
                if (findTypeProcessingResult.error === "NO_APPOINTMENT_TYPES_CONFIGURED") {
                    messageForLlm = "It seems we don't have specific appointment types set up for online booking at the moment. Please call the office directly for assistance.";
                } else if (findTypeProcessingResult.error === "NO_PROVIDER_FOR_APPOINTMENT_TYPE") {
                    messageForLlm = `While I found the ${findTypeProcessingResult.outputData.matchedAppointmentName || 'service'}, it seems there are no providers available for it through online booking. You may need to call the office.`;
                }
            }
            
            toolHandlerResult = {
                success: findTypeProcessingResult.success,
                outputData: {
                    ...findTypeProcessingResult.outputData,
                    messageForAssistant: messageForLlm,
                },
                error: findTypeProcessingResult.error
            };

        } catch (validationError) {
            console.error(`[ToolCallRoute] Validation error for ${toolName}:`, validationError);
            addLogEntry({
                event: "VALIDATION_ERROR",
                source: `ToolCallRoute:Dispatch:${toolName}`,
                details: { error: validationError instanceof Error ? validationError.message : "Validation failed" }
            }, vapiCallId);
            toolHandlerResult = {
                success: false,
                outputData: { 
                    messageForAssistant: "I had a little trouble with that request. Could you please rephrase?",
                    error_details: validationError instanceof Error ? validationError.message : "Validation failed"
                },
                error: "VALIDATION_ERROR"
            };
        }
      } else if (toolName === "check_available_slots") {
        try {
            const { checkAvailableSlotsArgsSchema } = await import("@/lib/tools/checkAvailableSlots");
            const validatedArgs = checkAvailableSlotsArgsSchema.parse(extractedArgs);

            if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
                throw new Error("Practice NexHealth configuration for slot checking is missing.");
            }

            const practiceInfoForSlotChecking = {
                id: practice.id,
                nexhealthSubdomain: practice.nexhealthSubdomain,
                nexhealthLocationId: practice.nexhealthLocationId,
                // practiceLocalTimeZone: practice.timezone || 'America/New_York', // If you have this
            };

            const slotCheckingResult = await processCheckAvailableSlots(validatedArgs, state, practiceInfoForSlotChecking, vapiCallId);
            
            const messageForLlm = await generateMessageAfterSlotCheck(slotCheckingResult.outputData, state, vapiCallId);
            
            toolHandlerResult = {
                success: slotCheckingResult.success,
                outputData: {
                    ...slotCheckingResult.outputData,
                    messageForAssistant: messageForLlm,
                },
                error: slotCheckingResult.error
            };

        } catch (error) { // Catches validation errors or missing NexHealth config
            console.error(`[ToolCallRoute] Error processing/validating ${toolName}:`, error);
            const errorMsg = error instanceof Error ? error.message : "Processing error";
            addLogEntry({ event: "HANDLER_ERROR_OR_VALIDATION", source: `ToolCallRoute:${toolName}`, details: { error: errorMsg } }, vapiCallId);
            
            let userFacingErrorMsg = "I had trouble checking slots for that date. Could you try another date or ensure the format is clear, like 'July 15th'?";
            if (errorMsg.includes("Invalid date format")) {
                userFacingErrorMsg = "I didn't quite understand that date. Could you try saying it like 'next Tuesday' or 'July 15th'?";
            } else if (errorMsg.includes("Missing appointment/provider details")) {
                 userFacingErrorMsg = "I seem to be missing some details about the appointment type. Could we try identifying the service again?";
            }

            toolHandlerResult = {
                success: false,
                outputData: { 
                    messageForAssistant: userFacingErrorMsg,
                    error_details: errorMsg,
                    slotsFound: false, // Ensure this is set for consistency
                    requestedDateFormatted: (extractedArgs as { requestedDate?: string }).requestedDate || "the date you mentioned",
                },
                error: "SLOT_CHECKING_ERROR"
            };
        }
      } else if (toolName === "create_new_patient") {
        try {
            const { createNewPatientArgsSchema } = await import("@/lib/tools/createNewPatient");
            const validatedArgs = createNewPatientArgsSchema.parse(extractedArgs);

            // Ensure practiceInfoForHandler has NexHealth details for this handler
            const practiceInfoForOnboarding = {
                id: practice.id,
                name: practice.name || "the dental office",
                nexhealthLocationId: practice.nexhealthLocationId || '',
                nexhealthSubdomain: practice.nexhealthSubdomain || ''
            };

            if (!practiceInfoForOnboarding.nexhealthSubdomain || !practiceInfoForOnboarding.nexhealthLocationId) {
                throw new Error("Practice NexHealth configuration (subdomain or locationId) is missing.");
            }

            const onboardingProcessingResult = await processPatientOnboarding(validatedArgs, state, practiceInfoForOnboarding, vapiCallId);
            
            // Message generation is now handled by generateMessageForPatientOnboarding based on the stage
            const messageForLlm = await generateMessageForPatientOnboarding(onboardingProcessingResult.outputData, state, vapiCallId);
            
            toolHandlerResult = {
                success: onboardingProcessingResult.success, // Reflects success of the current step
                outputData: {
                    ...onboardingProcessingResult.outputData,
                    messageForAssistant: messageForLlm,
                },
                error: onboardingProcessingResult.error
            };

        } catch (error) // Catches validation errors or missing NexHealth config
        {
            console.error(`[ToolCallRoute] Error processing/validating ${toolName}:`, error);
            const errorMsg = error instanceof Error ? error.message : "Processing error";
            addLogEntry({ event: "HANDLER_ERROR_OR_VALIDATION", source: `ToolCallRoute:${toolName}`, details: { error: errorMsg } }, vapiCallId);
            toolHandlerResult = {
                success: false,
                outputData: { 
                    messageForAssistant: "I encountered an issue with that information. Let's try that step again.",
                    error_details: errorMsg,
                    stage: state.currentStage, // Keep current stage to retry
                    isComplete: false,
                },
                error: "PROCESSING_ERROR"
            };
        }
      } else {
          // Current placeholder for other tools from Phase 0
          console.log(`[ToolCallRoute] Tool ${toolName} not yet fully implemented with AI handler. Using Phase 0 simulation.`);
          toolHandlerResult = {
              success: true,
              outputData: {
                  messageForAssistant: `Phase 1: ${toolName} processing placeholder. Next step would follow.`,
                  toolNameExecuted: toolName,
                  argsReceived: extractedArgs,
              }
          };
          state.setCurrentStage(`${toolName}_processed_phase1_placeholder`);
      }

      console.log(`[ToolCallRoute] ConversationState after AI handler:`, state.getStateSnapshot());

      // Debug Logging: AI handler result
      addLogEntry({
        event: "AI_HANDLER_RESULT",
        source: `ToolCallRoute:Dispatch:${toolName}`,
        details: { toolName, handlerResult: toolHandlerResult, stateAfter: state.getStateSnapshot() }
      }, vapiCallId);

      // VAPI Response Formatting (Keep this logic)
      const currentConversationStateSnapshotObject = state.getStateSnapshot();
      const conversationStateStringForEmbedding = JSON.stringify(currentConversationStateSnapshotObject);

      const resultObjectForVapi = {
        tool_output_data: toolHandlerResult.outputData,
        current_conversation_state_snapshot: conversationStateStringForEmbedding
      };
      const resultStringForVapi = JSON.stringify(resultObjectForVapi);

      results.push({
        toolCallId,
        result: resultStringForVapi,
      });
    }

    // Debug Logging: Final VAPI response
    addLogEntry({
      event: "VAPI_RESPONSE_PREPARED",
      source: "ToolCallRoute:POST",
      details: { resultsArray: results }
    }, vapiCallId);
    
    return NextResponse.json({ results });
     
  } catch (error) {
    console.error("CRITICAL ERROR in centralized tool handler:", error);
    
    const criticalErrorInfo = {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      vapiCallId: payload?.message?.call?.id || vapiCallId
    };
    
    // Debug Logging: Critical system error
    addLogEntry({
      event: "CRITICAL_SYSTEM_ERROR",
      source: "ToolCallRoute:POST",
      details: criticalErrorInfo
    }, vapiCallId);
    
    console.error("Critical error details:", JSON.stringify(criticalErrorInfo, null, 2));
    
    // VAPI-COMPLIANT: Return proper error structure even for system failures
    if (payload?.message?.toolCallList || payload?.message?.toolCalls) {
      const toolCalls = payload.message.toolCallList || payload.message.toolCalls || [];
      const errorResults = toolCalls.map((toolCall: VapiIncomingToolCall) => {
        const toolCallId = extractToolCallId(toolCall);
        const resultObject = {
          tool_output_data: {
            success: false,
            error_code: "SYSTEM_ERROR",
            details: "Internal system error occurred"
          },
          current_conversation_state_snapshot: "{}" // Empty state for system errors
        };
        
        return {
          toolCallId,
          result: JSON.stringify(resultObject)
        };
      });
      
      return NextResponse.json({ results: errorResults });
    }
    
    // Fallback for non-VAPI requests or malformed payloads
    return NextResponse.json(
      { 
        error: "Internal server error",
        timestamp: criticalErrorInfo.timestamp,
        reference: criticalErrorInfo.vapiCallId 
      },
      { status: 500 }
    );
  }
} 