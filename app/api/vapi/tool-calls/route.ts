import { NextRequest, NextResponse } from "next/server";
import { getToolByName } from "@/lib/tools";
import { prisma } from "@/lib/prisma";
import { ToolExecutionContext, ToolDefinition } from "@/lib/tools/types";
import { getErrorCode, getPatientMessage } from "@/lib/utils/error-messages";
import { generateCallSummaryForNote } from "@/lib/ai/summarization";
import { generateText, CoreMessage } from 'ai';
import { openai } from '@ai-sdk/openai';

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
    toolCallList?: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
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
        console.log(`   Pattern used: Looking for Royal Oak or xyz subdomain`);
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
          console.log(`   Note: This should be temporary - assistant name should be fixed`);
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
        appointmentTypes: true,
        savedProviders: {
          where: { isActive: true },
          include: {
            provider: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nexhealthProviderId: true
              }
            }
          }
        },
        savedOperatories: {
          where: { isActive: true }
        }
      }
    });
    
    if (!practice) {
      console.error(`❌ Practice not found: ${practiceId}`);
      return null;
    }
    
    console.log("✅ Loaded practice with scheduling data:", {
      id: practice.id,
      name: practice.name,
      appointmentTypes: practice.appointmentTypes.length,
      savedProviders: practice.savedProviders.length,
      savedOperatories: practice.savedOperatories.length
    });
    
    return practice;
  } catch (error) {
    console.error("❌ Error fetching practice with scheduling data:", error);
    return null;
  }
}

// Enhanced tool name extraction function
function extractToolName(toolCall: any): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  // Log the tool call structure for debugging
  console.log("=== Tool Call Structure Debug ===");
  console.log("Tool call keys:", Object.keys(toolCall));
  console.log("Tool call object:", JSON.stringify(toolCall, null, 2));
  
  // Method 1: Check function.name (most common)
  if (toolCall.function && typeof toolCall.function === 'object' && toolCall.function.name) {
    console.log("✅ Found tool name in function.name:", toolCall.function.name);
    return toolCall.function.name;
  }
  
  // Method 2: Check direct name property
  if (toolCall.name && typeof toolCall.name === 'string') {
    console.log("✅ Found tool name in name:", toolCall.name);
    return toolCall.name;
  }
  
  // Method 3: Check if function is a string (edge case)
  if (typeof toolCall.function === 'string') {
    console.log("✅ Found tool name as string in function:", toolCall.function);
    return toolCall.function;
  }
  
  console.error("❌ Unable to extract tool name from tool call");
  console.error("Available fields:", {
    hasFunction: !!toolCall.function,
    functionType: typeof toolCall.function,
    functionKeys: toolCall.function ? Object.keys(toolCall.function) : null,
    hasName: !!toolCall.name,
    nameType: typeof toolCall.name
  });
  
  return null;
}

// Enhanced tool call ID extraction function
function extractToolCallId(toolCall: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  // Method 1: Check id property
  if (toolCall.id && typeof toolCall.id === 'string') {
    console.log("✅ Found tool call ID in id:", toolCall.id);
    return toolCall.id;
  }
  
  // Method 2: Check toolCallId property
  if (toolCall.toolCallId && typeof toolCall.toolCallId === 'string') {
    console.log("✅ Found tool call ID in toolCallId:", toolCall.toolCallId);
    return toolCall.toolCallId;
  }
  
  // Method 3: Generate fallback ID
  const fallbackId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.warn("⚠️ No tool call ID found, using fallback:", fallbackId);
  
  return fallbackId;
}

// Enhanced tool call argument extraction
function extractToolCallArguments(toolCall: any): Record<string, unknown> { // eslint-disable-line @typescript-eslint/no-explicit-any
  console.log("=== Tool Call Arguments Extraction ===");
  console.log("Tool call structure:", Object.keys(toolCall));
  
  // Handle multiple possible argument formats from VAPI
  if (typeof toolCall.arguments === 'string') {
    try {
      const parsed = JSON.parse(toolCall.arguments);
      console.log("✅ Parsed arguments from string:", parsed);
      return parsed;
    } catch (error) {
      console.error("❌ Failed to parse tool call arguments as JSON string:", error);
      return {};
    }
  }
  
  if (typeof toolCall.arguments === 'object' && toolCall.arguments !== null) {
    console.log("✅ Using arguments object directly:", toolCall.arguments);
    return toolCall.arguments;
  }
  
  // Check if arguments are in toolCall.function.arguments
  if (toolCall.function?.arguments) {
    if (typeof toolCall.function.arguments === 'string') {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        console.log("✅ Parsed function arguments from string:", parsed);
        return parsed;
      } catch (error) {
        console.error("❌ Failed to parse function arguments as JSON string:", error);
        return {};
      }
    }
    
    if (typeof toolCall.function.arguments === 'object') {
      console.log("✅ Using function arguments object:", toolCall.function.arguments);
      return toolCall.function.arguments;
    }
  }
  
  console.error("❌ Unable to extract arguments from tool call:", toolCall);
  return {};
}

/**
 * Generate dynamic message using LLM based on tool execution outcome
 */
async function generateDynamicMessage(
  toolName: string,
  toolArgs: unknown,
  toolResult: { success: boolean; data?: Record<string, unknown>; error_code?: string; _internal_prereq_failure_info?: { missingArg: string, askUserMessage: string } }
): Promise<string> {
  try {
    const systemPromptContent = `
You are a friendly and helpful AI dental office assistant named Laine.
A tool has just been executed (or attempted). Based on the tool's name, its input arguments, and the execution outcome,
craft ONE concise, conversational sentence to tell the patient.
This sentence should:
1. Briefly acknowledge the action or what was checked.
2. Clearly state the result (e.g., success, specific data found, failure, information missing).
3. If successful and more steps are needed, naturally lead to the next question or action.
4. If failed or information is missing, politely explain and ask for the necessary information or suggest an alternative.
5. Sound human and empathetic. Avoid robotic phrasing.

If the 'execution_outcome' indicates a 'PREREQUISITE_MISSING' error_code and provides 'prerequisite_failure_details' (like the missing argument name and a suggested question for the user),
your primary goal is to rephrase the suggested question ('askUserMessage') into a natural, polite, single sentence to ask the patient for that specific missing information.
Example: If tool 'check_slots' needs 'appointment_type' and the suggested question is "What type of appointment are you looking for?",
you might say: "Sure, I can check that for you! What type of appointment did you have in mind?"
Return ONLY that single sentence. Do not add any preamble like "Okay, here's the sentence:".
    `.trim();

    // Prepare a summary of data for the LLM. Be selective to keep the prompt concise.
    let dataSummaryForLLM = {};
    if (toolResult.data) {
      // Example: For findPatient, you might extract specific fields
      if (toolName === 'find_patient_in_ehr' && toolResult.data.patient_exists) {
        dataSummaryForLLM = {
          patient_found: true,
          patient_name: toolResult.data.confirmed_patient_name,
          patient_dob: toolResult.data.confirmed_patient_dob_friendly
        };
      } else if (toolName === 'check_available_slots' && toolResult.data.has_availability) {
        dataSummaryForLLM = {
          slots_found: true,
          num_slots_offered: toolResult.data.slots_offered,
          first_few_slots_display: (toolResult.data.available_slots as any[] || []) // eslint-disable-line @typescript-eslint/no-explicit-any
                                  .slice(0, toolResult.data.slots_offered as number || 3)
                                  .map((s: any) => s.display_time).join(', ') // eslint-disable-line @typescript-eslint/no-explicit-any
        };
      } else if (toolName === 'check_available_slots' && !toolResult.data.has_availability) {
        dataSummaryForLLM = { 
          slots_found: false, 
          appointment_type_name: toolResult.data.appointment_type_name, 
          requested_date_friendly: toolResult.data.requested_date_friendly 
        };
      } else {
        // For other tools, pass a subset of the data
        dataSummaryForLLM = toolResult.data;
      }
    }

    // Build execution outcome object
    const executionOutcome: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      success: toolResult.success,
      data_summary: dataSummaryForLLM,
      error_code: toolResult.error_code
    };

    // Add prerequisite failure details if present
    if (toolResult._internal_prereq_failure_info) {
      executionOutcome.prerequisite_failure_details = {
        missing_argument_name: toolResult._internal_prereq_failure_info.missingArg,
        suggested_question_for_user: toolResult._internal_prereq_failure_info.askUserMessage
      };
    }

    const llmMessages: CoreMessage[] = [
      { role: 'system', content: systemPromptContent },
      {
        role: 'user',
        content: JSON.stringify({
          tool_name: toolName,
          tool_arguments: toolArgs,
          execution_outcome: executionOutcome
        }, null, 2)
      }
    ];

    const { text: generatedMessage } = await generateText({
      model: openai('gpt-4o-mini'),
      messages: llmMessages,
      temperature: 0.7,
      maxTokens: 80
    });

    return generatedMessage.trim();
  } catch (generationError) {
    console.error(`Error generating dynamic message for tool ${toolName}:`, generationError);
    
    // Fallback message if LLM generation fails
    if (toolResult.success) {
      return "Okay, I've processed that.";
    } else {
      // More specific fallback messages based on error_code
      if (toolResult.error_code === 'NEXHEALTH_API_ERROR') {
        return "I'm having trouble connecting to the scheduling system right now. Please try again in a moment.";
      }
      return "I encountered an issue. Please try again.";
    }
  }
}

async function executeToolSafely(
  // Use more flexible typing to avoid constraint issues
  tool: ToolDefinition<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  toolCall: any, // eslint-disable-line @typescript-eslint/no-explicit-any 
  context: ToolExecutionContext,
  callLogContextData?: { nexhealthPatientId?: string | null } | null
) {
  try {
    const parsedArgs = extractToolCallArguments(toolCall);
    const startTime = Date.now();
    
    console.log(`Executing tool: ${tool.name} for practice ${context.practice.id} with args:`, parsedArgs);
    
    // Check prerequisites before executing tool
    if (tool.prerequisites && tool.prerequisites.length > 0) {
      for (const prereq of tool.prerequisites) {
        // Check if the prerequisite argument is present in parsedArgs AND is not obviously empty/null.
        const argValueFromLlm = parsedArgs[prereq.argName];
        let actualArgValue = argValueFromLlm; // Value from LLM's current arguments

        // Attempt to find the prerequisite from callLogContextData if missing from LLM args
        if (actualArgValue === undefined || actualArgValue === null || (typeof actualArgValue === 'string' && actualArgValue.trim() === '')) {
          if (prereq.argName === 'patientId' && callLogContextData?.nexhealthPatientId) {
            console.log(`[${tool.name}] Prerequisite '${prereq.argName}' not in LLM args, but found in CallLog context: ${callLogContextData.nexhealthPatientId}`);
            actualArgValue = callLogContextData.nexhealthPatientId;
            // IMPORTANT: If using from context, add it back to parsedArgs
            // so that Zod validation and tool.run() receive it.
            parsedArgs[prereq.argName] = actualArgValue;
          }
          // Add similar checks for other contextually available args, e.g., 'appointmentTypeId'
          // else if (prereq.argName === 'appointmentTypeId' && callLogContextData?.lastAppointmentTypeId) {
          //   actualArgValue = callLogContextData.lastAppointmentTypeId;
          //   parsedArgs[prereq.argName] = actualArgValue;
          // }
        }

        const isArgStillMissingOrEmpty = actualArgValue === undefined || actualArgValue === null || (typeof actualArgValue === 'string' && actualArgValue.trim() === '');

        if (isArgStillMissingOrEmpty) {
          console.log(`[${tool.name}] Prerequisite missing: ${prereq.argName}. Prompting user.`);

          const prerequisiteFailureResult: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
            success: false, // Mark as not successful for the tool's main goal
            error_code: "PREREQUISITE_MISSING",
            details: `Missing prerequisite: ${prereq.argName}. User needs to be asked: "${prereq.askUserMessage}"`,
            // The actual message_to_patient will be generated by generateDynamicMessage
            _internal_prereq_failure_info: {
              missingArg: prereq.argName,
              askUserMessage: prereq.askUserMessage
            }
          };

          // Call the dynamic message generator with this specific failure info
          const finalMessage = await generateDynamicMessage(
            tool.name,
            parsedArgs, // Arguments as received from LLM
            prerequisiteFailureResult, // Cast or adjust type
          );
          
          // Construct the full result to return
          const resultWithDynamicMessage = {
              success: false,
              error_code: "PREREQUISITE_MISSING",
              message_to_patient: finalMessage, // The LLM generated message
              details: `Missing prerequisite: ${prereq.argName}. User prompted.`,
              data: {
                  missing_prerequisite: prereq.argName,
                  prompt_for_user: prereq.askUserMessage
              }
          };

          // Log this pre-emptive failure
          await logToolExecution(
            context,
            tool.name,
            parsedArgs,
            resultWithDynamicMessage, // Log the result that includes the user prompt
            false, // Not a successful tool execution
            `Prerequisite check failed: ${prereq.argName} was missing.`
          );

          return resultWithDynamicMessage; // Return early, do not proceed to Zod validation or tool.run()
        }
      }
    }
    
    // Pre-validation for create_new_patient to prevent premature calls
    if (tool.name === 'create_new_patient') {
      const preValidationResult = validateCreateNewPatientArgs(parsedArgs);
      if (!preValidationResult.isValid) {
        console.log(`[${tool.name}] Pre-validation failed:`, preValidationResult.reason);
        
        const preValidationError = {
          success: false,
          error_code: preValidationResult.errorCode,
          message_to_patient: preValidationResult.message || "Missing information",
          details: preValidationResult.reason
        };
        
        // Generate dynamic message for pre-validation error
        preValidationError.message_to_patient = await generateDynamicMessage(
          tool.name,
          parsedArgs,
          preValidationError
        );
        
        // Log the pre-validation failure
        await logToolExecution(
          context,
          tool.name,
          parsedArgs,
          preValidationError,
          false,
          preValidationResult.reason
        );
        
        return preValidationError;
      }
    }
    
    // Validate arguments with tool schema
    const validatedArgs = tool.schema.parse(parsedArgs);
    
    const toolResult = await tool.run({
      args: validatedArgs,
      context
    });
    
    // Generate dynamic message for successful execution
    toolResult.message_to_patient = await generateDynamicMessage(
      tool.name,
      validatedArgs,
      toolResult
    );
    
    const executionTime = Date.now() - startTime;
    
    // Log successful execution
    await logToolExecution(
      context,
      tool.name,
      validatedArgs,
      toolResult,
      true,
      undefined,
      executionTime
    );
    
    return toolResult;
  } catch (error) {
    console.error(`Error executing tool ${tool.name}:`, error);
    
    const errorResult = {
      success: false,
      error_code: getErrorCode(error, tool.name),
      message_to_patient: getPatientMessage(getErrorCode(error, tool.name)),
      details: error instanceof Error ? error.message : "Unknown error"
    };
    
    // Generate dynamic message for general execution error
    errorResult.message_to_patient = await generateDynamicMessage(
      tool.name,
      toolCall.arguments || toolCall.function?.arguments || {},
      errorResult
    );
    
    // Log failed execution
    await logToolExecution(
      context,
      tool.name,
      toolCall.arguments || toolCall.function?.arguments || {},
      errorResult,
      false,
      error instanceof Error ? error.message : "Unknown error"
    );
    
    return errorResult;
  }
}

/**
 * Pre-validation for create_new_patient to prevent premature tool calls
 */
function validateCreateNewPatientArgs(args: any): { // eslint-disable-line @typescript-eslint/no-explicit-any
  isValid: boolean;
  errorCode?: string;
  message?: string;
  reason?: string;
} {
  // Check if any required field is missing or empty
  const requiredFields = ['firstName', 'lastName', 'dateOfBirth', 'phone', 'email'];
  const missingFields = [];
  
  for (const field of requiredFields) {
    if (!args[field] || typeof args[field] !== 'string' || args[field].trim().length === 0) {
      missingFields.push(field);
    }
  }
  
  // If multiple fields are missing, provide comprehensive guidance
  if (missingFields.length > 1) {
    const missingFieldsStr = missingFields.join(', ');
    let message = "";
    
    if (missingFields.includes('firstName') || missingFields.includes('lastName') || missingFields.includes('dateOfBirth')) {
      message = "I need to collect some information to create your patient record. Could you spell your first and last name letter by letter, then give me your date of birth?";
    } else if (missingFields.includes('phone') && missingFields.includes('email')) {
      message = "I still need your phone number and email address to finish creating your patient record. What's your phone number?";
    } else {
      message = getMissingFieldMessage(missingFields[0]);
    }
    
    return {
      isValid: false,
      errorCode: getMissingFieldErrorCode(missingFields[0]),
      message,
      reason: `Multiple missing fields: ${missingFieldsStr}`
    };
  }
  
  // Single field missing
  if (missingFields.length === 1) {
    const field = missingFields[0];
    return {
      isValid: false,
      errorCode: getMissingFieldErrorCode(field),
      message: getMissingFieldMessage(field),
      reason: `Missing or empty ${field}: "${args[field]}"`
    };
  }
  
  // Additional validation for phone (minimum 10 digits)
  const phoneDigits = args.phone.replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    return {
      isValid: false,
      errorCode: 'MISSING_PHONE',
      message: "I need your phone number to create your patient record. What's your phone number?",
      reason: `Phone number too short: "${args.phone}" (${phoneDigits.length} digits)`
    };
  }
  
  // Additional validation for email (basic @ check)
  if (!args.email.includes('@') || !args.email.includes('.')) {
    return {
      isValid: false,
      errorCode: 'MISSING_EMAIL',
      message: "I need your email address to create your patient record. What's your email address?",
      reason: `Invalid email format: "${args.email}"`
    };
  }
  
  return { isValid: true };
}

/**
 * Get error code for missing field
 */
function getMissingFieldErrorCode(field: string): string {
  switch (field) {
    case 'firstName': return 'MISSING_FIRST_NAME';
    case 'lastName': return 'MISSING_LAST_NAME';
    case 'dateOfBirth': return 'INVALID_DATE_OF_BIRTH';
    case 'phone': return 'MISSING_PHONE';
    case 'email': return 'MISSING_EMAIL';
    default: return 'VALIDATION_ERROR';
  }
}

/**
 * Get error message for missing field
 */
function getMissingFieldMessage(field: string): string {
  switch (field) {
    case 'firstName': 
      return "I need your first name to create your patient record. Could you tell me your first name?";
    case 'lastName': 
      return "I need your last name to create your patient record. Could you tell me your last name?";
    case 'dateOfBirth': 
      return "I need your date of birth to create your patient record. Could you tell me your date of birth?";
    case 'phone': 
      return "I need your phone number to create your patient record. What's your phone number?";
    case 'email': 
      return "I need your email address to create your patient record. What's your email address?";
    default: 
      return "I need some additional information to complete your registration.";
  }
}

async function logToolExecution(
  context: ToolExecutionContext,
  toolName: string,
  arguments_: unknown,
  result: unknown,
  success: boolean,
  error?: string,
  executionTimeMs?: number
) {
  try {
    await prisma.toolLog.create({
      data: {
        practiceId: context.practice.id,
        vapiCallId: context.vapiCallId,
        toolName,
        toolCallId: context.toolCallId,
        arguments: JSON.stringify(arguments_),
        result: JSON.stringify(result),
        success,
        error,
        executionTimeMs: executionTimeMs || 0
      }
    });
  } catch (logError) {
    console.error("Error logging tool execution:", logError);
  }
}

export async function POST(req: NextRequest) {
  console.log("=== VAPI Centralized Tool Handler ===");
  
  try {
    // TODO: Implement request verification when VAPI provides signing
    
    const payload: VapiPayload = await req.json();
    console.log("VAPI payload:", JSON.stringify(payload, null, 2));
    
    // Validate payload structure
    if (!payload.message || payload.message.type !== "tool-calls") {
      console.error("Invalid payload type:", payload.message?.type);
      return NextResponse.json({ error: "Invalid payload type" }, { status: 400 });
    }
    
    const { message } = payload;
    const vapiCallId = message.call.id;
    
    let assistantId: string;
    let practice: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    
    try {
      assistantId = extractAssistantId(payload);
      practice = await findPracticeByAssistantId(assistantId);
      
      if (!practice) {
        throw new Error(`No practice found for assistant ID/name: ${assistantId}`);
      }
    } catch (error) {
      console.error("Assistant ID extraction or practice lookup failed:", error);
      
      // Create detailed error for debugging
      const debugInfo = {
        error: error instanceof Error ? error.message : "Unknown error",
        callId: vapiCallId,
        assistantName: (message.assistant as any)?.name, // eslint-disable-line @typescript-eslint/no-explicit-any
        availableFields: {
          call: Object.keys(message.call || {}),
          assistant: Object.keys(message.assistant || {})
        }
      };
      
      console.error("Debug info:", JSON.stringify(debugInfo, null, 2));
      
      // Return error results for all tool calls
      const toolCalls = message.toolCallList || message.toolCalls || [];
      const errorResults = toolCalls.map((toolCall: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        toolCallId: extractToolCallId(toolCall),
        result: JSON.stringify({
          success: false,
          error_code: "ASSISTANT_ID_OR_PRACTICE_ERROR", 
          message_to_patient: "I'm having trouble connecting to your practice's system. Please try again or contact the office directly.",
          debug_info: debugInfo
        })
      }));
      
      return NextResponse.json({ results: errorResults });
    }
    
    // Update call log status and fetch existing context data
    let callLogContextData = null;
    try {
      const updatedCallLog = await prisma.callLog.upsert({
        where: { vapiCallId },
        create: {
          vapiCallId,
          practiceId: practice.id,
          callStatus: "TOOL_IN_PROGRESS",
          callTimestampStart: new Date()
        },
        update: {
          callStatus: "TOOL_IN_PROGRESS",
          updatedAt: new Date()
        },
        select: { nexhealthPatientId: true } // Fetch context data for prerequisites
      });
      
      callLogContextData = updatedCallLog;
      console.log(`[ToolCallHandler] Fetched CallLog context:`, callLogContextData);
    } catch (dbError) {
      console.error("Error updating CallLog:", dbError);
      // Try to fetch existing call log context data separately
      try {
                 const existingCallLog = await prisma.callLog.findUnique({
           where: { vapiCallId: vapiCallId },
           select: { nexhealthPatientId: true }
        });
        if (existingCallLog) {
          callLogContextData = existingCallLog;
          console.log(`[ToolCallHandler] Fetched existing CallLog context:`, callLogContextData);
        }
      } catch (fallbackError) {
        console.error(`[ToolCallHandler] Error fetching CallLog for context:`, fallbackError);
      }
    }
    
    // Process all tool calls
    const results = [];
    
    console.log(`Processing ${(message.toolCallList || []).length} tool call(s)`);
    
    for (let i = 0; i < (message.toolCallList || []).length; i++) {
      const toolCall = (message.toolCallList || [])[i];
      
      console.log(`=== Processing Tool Call ${i + 1}/${(message.toolCallList || []).length} ===`);
     
      // Enhanced tool name extraction
      const toolName = extractToolName(toolCall);
      const toolCallId = extractToolCallId(toolCall);
      
      console.log(`Tool: ${toolName}, ID: ${toolCallId}`);
     
      if (!toolName) {
        console.error(`❌ Unable to extract tool name from tool call ${i + 1}`);
        results.push({
          toolCallId,
          result: JSON.stringify({
            success: false,
            error_code: "INVALID_TOOL_CALL",
            message_to_patient: getPatientMessage("VALIDATION_ERROR"),
            debug_info: {
              toolCallIndex: i,
              availableFields: Object.keys(toolCall),
              toolCallStructure: toolCall
            }
          })
        });
        continue;
      }
      
      const tool = getToolByName(toolName);
      
      if (!tool) {
        console.error(`❌ Unknown tool: ${toolName}`);
        results.push({
          toolCallId,
          result: JSON.stringify({
            success: false,
            error_code: "SYSTEM_ERROR",
            message_to_patient: getPatientMessage("SYSTEM_ERROR"),
            debug_info: {
              requestedTool: toolName,
              toolCallIndex: i
            }
          })
        });
        continue;
      }
      
      console.log(`✅ Found tool: ${tool.name}`);
      
      let callSummaryForNote: string | undefined = undefined; // Initialize here

      if (tool.name === "book_appointment") {
        // Debug: Log the call artifact structure to understand the payload
        console.log("[ToolCallHandler] Call artifact structure:", JSON.stringify(payload.message.call.artifact || payload.message.call, null, 2));
        
        let extractedTranscript = payload.message.call.artifact?.transcript;

        if (!extractedTranscript || typeof extractedTranscript !== 'string' || extractedTranscript.trim() === "") {
          console.warn("[ToolCallHandler] `artifact.transcript` is empty or missing. Checking alternative paths and constructing from messages.");
          
          // Try alternative paths for transcript
          const alternativePaths = [
            payload.message.call.transcript,
            payload.message.call.artifact?.messages,
            payload.message.call.artifact?.messagesOpenAIFormatted,
            payload.message.artifact?.transcript,
            payload.message.artifact?.messages,
            payload.message.artifact?.messagesOpenAIFormatted
          ];
          
          // Check for direct transcript in alternative locations
          for (const path of alternativePaths.slice(0, 1)) { // First check direct transcript paths
            if (path && typeof path === 'string' && path.trim() !== '') {
              extractedTranscript = path;
              console.log(`[ToolCallHandler] Found transcript in alternative path. Length: ${extractedTranscript.length}`);
              break;
            }
          }
          
          // If still no transcript, try to construct from messages
          if (!extractedTranscript || extractedTranscript.trim() === "") {
            const messagesArrays = [
              payload.message.call.artifact?.messages,
              payload.message.call.artifact?.messagesOpenAIFormatted,
              payload.message.artifact?.messages,
              payload.message.artifact?.messagesOpenAIFormatted
            ];
            
            for (const messages of messagesArrays) {
              if (Array.isArray(messages) && messages.length > 0) {
                console.log(`[ToolCallHandler] Constructing transcript from messages array with ${messages.length} items.`);
                console.log("[ToolCallHandler] Messages structure sample:", JSON.stringify(messages.slice(0, 3), null, 2));
                
                extractedTranscript = messages
                  .filter(msg => {
                    // Handle different message structures
                    const hasMessage = (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'bot') && 
                                     (typeof msg.message === 'string' || typeof msg.content === 'string');
                    return hasMessage;
                  })
                  .map(msg => {
                    const role = msg.role === 'bot' ? 'assistant' : msg.role; // Normalize 'bot' to 'assistant'
                    const content = msg.message || msg.content || '';
                    return `${role}: ${content}`;
                  })
                  .join('\n');
                
                if (extractedTranscript.trim()) {
                  console.log(`[ToolCallHandler] Successfully constructed transcript from messages. Length: ${extractedTranscript.length}`);
                  break;
                } else {
                  console.warn("[ToolCallHandler] Constructed transcript from messages is empty, trying next messages array.");
                }
              }
            }
          }
        } else {
          console.log(`[ToolCallHandler] Using provided artifact.transcript. Length: ${extractedTranscript.length}`);
        }

        if (extractedTranscript && typeof extractedTranscript === 'string' && extractedTranscript.trim() !== "") {
          try {
            console.log(`[ToolCallHandler] Generating summary for book_appointment. Transcript used (first 500 chars): \n"""\n${extractedTranscript.substring(0, 500)}${extractedTranscript.length > 500 ? '...' : ''}\n"""`);
            callSummaryForNote = await generateCallSummaryForNote(extractedTranscript);
            console.log("[ToolCallHandler] Generated summary for note:", callSummaryForNote);
          } catch (summaryError) {
            console.error("[ToolCallHandler] Failed to generate call summary for note:", summaryError);
            callSummaryForNote = "AI summary generation failed for appointment note.";
          }
        } else {
          console.warn("[ToolCallHandler] No transcript available (neither direct nor constructed) for book_appointment summary.");
          callSummaryForNote = "No transcript available for summary note.";
        }
      }
      
      // Create execution context
      const context: ToolExecutionContext = {
        practice,
        vapiCallId,
        toolCallId,
        assistantId: assistantId || "unknown",
        callSummaryForNote, // Pass the summary
      };
      
      const toolResult = await executeToolSafely(tool, toolCall, context, callLogContextData);
      
      let vapiToolResponseItem: any; // eslint-disable-line @typescript-eslint/no-explicit-any

      // Apply dynamic message structure for ALL tools
      if (toolResult.success) {
        vapiToolResponseItem = {
          toolCallId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          result: JSON.stringify((toolResult as any).data || {}), // Data for LLM context
          message: {
            type: "request-complete", // Vapi specific type
            content: toolResult.message_to_patient, // Dynamic message to be spoken
          },
        };
        console.log(`[ToolCallHandler] Tool: ${tool.name}. Prepared SUCCESS response for Vapi with immediate message:`, toolResult.message_to_patient);
      } else {
        vapiToolResponseItem = {
          toolCallId,
          error: toolResult.error_code || toolResult.details || "Tool execution failed", // Error info for LLM
          message: {
            type: "request-failed", // Vapi specific type
            content: toolResult.message_to_patient, // Dynamic error message to be spoken
          },
        };
        console.log(`[ToolCallHandler] Tool: ${tool.name}. Prepared FAILURE response for Vapi with immediate message:`, toolResult.message_to_patient);
      }

      results.push(vapiToolResponseItem);
      
      console.log(`✅ Tool ${toolName} completed. Success: ${toolResult.success}`);
    }
    
    console.log("Sending results to VAPI:", JSON.stringify({ results }));
    return NextResponse.json({ results });
     
  } catch (error) {
    console.error("Error in centralized tool handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 