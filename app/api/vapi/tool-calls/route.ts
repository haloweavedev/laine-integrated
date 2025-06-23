import { NextRequest, NextResponse } from "next/server";
import { getToolByName } from "@/lib/tools";
import { prisma } from "@/lib/prisma";
import { ToolExecutionContext, ToolDefinition } from "@/lib/tools/types";
import { getErrorCode, getPatientMessage } from "@/lib/utils/error-messages";
import { generateCallSummaryForNote } from "@/lib/ai/summarization";
import { generateText, CoreMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ConversationState } from "@/lib/conversationState";

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
// PERFORMANCE OPTIMIZATION: Optimized query with selective field fetching
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
            }
          }
        },
        savedOperatories: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            nexhealthOperatoryId: true
          }
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
 * OPTIMIZED for performance and minimal latency
 */
async function generateDynamicMessage(
  toolName: string,
  toolArgs: unknown,
  toolResult: { 
    success: boolean; 
    data?: Record<string, unknown>; 
    error_code?: string; 
    _internal_prereq_failure_info?: { missingArg: string, askUserMessage: string };
    flow_correction_guidance?: string;
  }
): Promise<string> {
  try {
    // PERFORMANCE OPTIMIZATION: Streamlined system prompt for speed with comprehensive error recovery
    const systemPromptContent = `
You are Laine, a friendly AI dental assistant. Based on the tool execution result, craft ONE concise, natural sentence.

GUIDELINES:
- Be empathetic and conversational
- Acknowledge what was checked/done
- State the result clearly and directly
- If successful and more steps needed, ask the next question
- If failed, politely explain and suggest actionable next steps
- Sound human, avoid robotic language or procedural descriptions
- Always offer alternatives when possible
- Avoid filler phrases like "Hold on", "Just a sec", "Let me process that"

ERROR RECOVERY BY CODE:
- PATIENT_NOT_FOUND: "I couldn't find your record. Could you verify your name and date of birth, or should I register you as a new patient?"
- APPOINTMENT_TYPE_NOT_FOUND: "I'm not sure what type of appointment you need. Could you describe it, or would you like me to list our services?"
- NO_AVAILABILITY: "I don't see any openings for that time. Would you like me to check another date?"
- NEXHEALTH_API_ERROR: "I'm having trouble with our scheduling system right now. Could we try again in a moment?"
- SCHEDULING_ERROR: "I had an issue checking that. Let me try again, or would you prefer to speak with our office?"
- VALIDATION_ERROR: "I didn't quite catch that. Could you try saying it differently?"
- MISSING_PHONE/EMAIL: "I need your [phone/email] to complete your registration. What's your [phone/email]?"
- INVALID_PHONE/EMAIL: "I didn't get a valid [phone/email]. Could you try again? For example, 'my phone is...' or 'my email is...'"
- INVALID_DATE: "I didn't understand that date. Could you try 'next Tuesday' or 'December 15th'?"
- SYSTEM_ERROR/TIMEOUT_ERROR: "I'm having a technical hiccup. You can try again, or I can connect you with our office staff."
- FLOW_INTERCEPTION: Use provided guidance naturally

FLOW GUIDANCE PATTERNS:
- IDENTIFY_PATIENT_FIRST: "To book your appointment, I need to identify you first. Could you please provide your full name and date of birth?"
- ASK_FOR_APPOINTMENT_TYPE_FIRST: "What type of appointment are you looking for today?"
- ASK_FOR_DATE_FIRST: "What date would you like for your appointment?"
- CHECK_AVAILABILITY_FIRST: "Let me check our availability for you first."
- CONFIRM_SLOT_FIRST: "Which of those available times works best for you?"
- PROCEED_WITH_NEW_PATIENT_REGISTRATION: "Since you're a new patient, let me get you registered first. What's your first name?"

TOOL-SPECIFIC PATTERNS:
- find_appointment_type SUCCESS: "Okay, a [type] is about [duration] minutes. What date works for you?"
- check_available_slots SUCCESS with times: "For [type] on [date], I have [times] available. Which works best for you?"
- check_available_slots SUCCESS no times: "I don't see any openings for [type] on [date]. Would you like me to check another date?"
- find_patient_in_ehr SUCCESS: "Found you, [name]! Let's continue with your appointment."
- book_appointment SUCCESS: "Confirmed! Your [type] with [provider] is set for [date] at [time]. Need directions?"
- create_new_patient SUCCESS: "Great, [name]! You're registered. Now let's schedule your [type] appointment."

Return ONLY the sentence.
    `.trim();

    // PERFORMANCE OPTIMIZATION: Minimize data passed to LLM - only essential fields
    let compactData = {};
    if (toolResult.data) {
      // Extract only the most essential fields per tool to reduce payload size
      switch (toolName) {
        case 'get_intent':
          // For get_intent, we don't generate any message since it's silent
          return "";
        case 'find_appointment_type':
          compactData = toolResult.data.matched ? {
            matched: true,
            name: toolResult.data.appointment_type_name,
            duration: toolResult.data.duration_minutes
          } : {
            matched: false,
            options: Array.isArray(toolResult.data.available_types_list_for_prompt) 
              ? toolResult.data.available_types_list_for_prompt.slice(0, 3) 
              : [] // Limit to 3 options
          };
          break;
        case 'check_available_slots':
          compactData = {
            available: toolResult.data.has_availability,
            type: toolResult.data.appointment_type_name,
            date: toolResult.data.requested_date_friendly,
            times: toolResult.data.has_availability && toolResult.data.offered_time_list_string_for_message_suggestion 
              ? toolResult.data.offered_time_list_string_for_message_suggestion
              : (toolResult.data.has_availability && Array.isArray(toolResult.data.available_slots) && toolResult.data.available_slots.length > 0
                ? toolResult.data.available_slots.slice(0, 3).map((slot: Record<string, unknown>) => slot.display_time).join(', ')
                : '')
          };
          break;
        case 'find_patient_in_ehr':
          compactData = {
            found: toolResult.data.patient_exists,
            name: toolResult.data.confirmed_patient_name || toolResult.data.searched_name
          };
          break;
        case 'book_appointment':
          compactData = {
            booked: toolResult.data?.booked,
            type: toolResult.data?.appointment_type_name,
            provider: toolResult.data?.provider_name,
            date: toolResult.data?.date_friendly,
            time: toolResult.data?.time
          };
          break;
        default:
          // For other tools, include minimal essential data
          compactData = toolResult.data ? {
            success: toolResult.success,
            key_result: Object.values(toolResult.data)[0] // Just the first value
          } : {};
      }
    }

    // Build minimal execution outcome
    const executionOutcome: Record<string, unknown> = {
      success: toolResult.success,
      data: compactData,
      error_code: toolResult.error_code
    };

    // Add prerequisite/flow guidance if present
    if (toolResult._internal_prereq_failure_info) {
      executionOutcome.ask_user = toolResult._internal_prereq_failure_info.askUserMessage;
    }
    if (toolResult.flow_correction_guidance) {
      executionOutcome.flow_guide = toolResult.flow_correction_guidance;
    }

    const llmMessages: CoreMessage[] = [
      { role: 'system', content: systemPromptContent },
      {
        role: 'user',
        content: JSON.stringify({
          tool: toolName,
          result: executionOutcome
        })
      }
    ];

    // PERFORMANCE OPTIMIZATION: Use gpt-4o-mini with optimal settings for speed
    const { text: generatedMessage } = await generateText({
      model: openai('gpt-4o-mini'), // Fastest suitable model
      messages: llmMessages,
      temperature: 0.3, // Lower for more consistent, faster responses
      maxTokens: 60 // Reduced from 80 for faster generation
    });

    return generatedMessage.trim();
  } catch (generationError) {
    console.error(`Error generating dynamic message for tool ${toolName}:`, generationError);
    
    // ENHANCED ERROR RECOVERY: Comprehensive fallback messages with actionable guidance
    const errorFallbacks: Record<string, string> = {
      'PATIENT_NOT_FOUND': "I couldn't find your record. Could you verify your name and date of birth, or should I register you as a new patient?",
      'APPOINTMENT_TYPE_NOT_FOUND': "I'm not sure what type of appointment you need. Could you describe it, or would you like me to list our services?",
      'NO_AVAILABILITY': "I don't see any openings for that time. Would you like me to check another date?",
      'NEXHEALTH_API_ERROR': "I'm having trouble with our scheduling system right now. Could we try again in a moment?",
      'SCHEDULING_ERROR': "I had an issue checking that. Let me try again, or would you prefer to speak with our office?",
      'VALIDATION_ERROR': "I didn't quite catch that. Could you try saying it differently?",
      'MISSING_PHONE': "I need your phone number to complete your registration. What's your phone number?",
      'MISSING_EMAIL': "I need your email address to complete your registration. What's your email address?",
      'INVALID_PHONE': "I didn't get a valid phone number. Could you try again? For example, 'my phone is three one three, five five five, one two three four'.",
      'INVALID_EMAIL': "I need a valid email address. Could you try again? For example, 'my email is john at gmail dot com'.",
      'INVALID_DATE': "I didn't understand that date. Could you try 'next Tuesday' or 'December 15th'?",
      'SYSTEM_ERROR': "I'm having a technical hiccup. You can try again, or I can connect you with our office staff.",
      'TIMEOUT_ERROR': "That's taking longer than expected. Please try again, or I can connect you with our office.",
      'PRACTICE_NOT_CONFIGURED': "Our scheduling system isn't fully set up yet. Please contact our office to schedule your appointment."
    };

    const toolFallbacks: Record<string, string> = {
      'get_intent': '', // Silent tool, no fallback message
      'find_appointment_type': 'What type of appointment are you looking for?',
      'check_available_slots': 'Let me check our availability for you.',
      'find_patient_in_ehr': 'Could you please provide your name and date of birth?',
      'book_appointment': 'Let me help you schedule that appointment.',
      'create_new_patient': 'I\'ll help you get registered in our system.'
    };
    
    if (toolResult.success) {
      return toolFallbacks[toolName] || "I've processed that for you.";
    } else {
      // Use specific error message if available
      if (toolResult.error_code && errorFallbacks[toolResult.error_code]) {
        return errorFallbacks[toolResult.error_code];
      }
      // Fall back to tool-specific message
      return toolFallbacks[toolName] || "Let me try that again for you.";
    }
  }
}

/**
 * Analyzes the attempted tool and current conversation state to determine if a flow correction is needed
 * Also suggests auxiliary tools that might be contextually appropriate
 */
function getNextLogicalStep(
  toolNameAttempted: string, 
  conversationState: ConversationState
): { requiredNextToolName?: string; guidanceMessageKey?: string; suggestedAuxiliaryTool?: string } | null {
  
  // If intent is not set and the tool being attempted is not get_intent, suggest calling get_intent first
  // This helps ensure we capture user intent early in the conversation
  if (!conversationState.intent && toolNameAttempted !== 'get_intent') {
    // However, allow certain informational tools to proceed without intent
    const informationalTools = ['get_practice_details', 'check_insurance_participation', 'get_service_cost_estimate'];
    if (!informationalTools.includes(toolNameAttempted)) {
      console.log(`[${toolNameAttempted}] No intent captured yet, consider calling get_intent first`);
      // Don't force get_intent for now, but this could be enabled for stricter flow control
      // return {
      //   requiredNextToolName: 'get_intent',
      //   guidanceMessageKey: 'CAPTURE_INTENT_FIRST'
      // };
    }
  }
  
  // Enhanced patient status handling for onboarding flow
  if (conversationState.intent && conversationState.intent.includes('BOOK') && conversationState.patientStatus === 'unknown') {
    // User wants to book but we don't know if they're new or existing
    return {
      guidanceMessageKey: 'DETERMINE_PATIENT_STATUS_FIRST'
    };
  }
  
  // If trying to find patient but user already confirmed they are new, skip to new patient creation
  if (toolNameAttempted === 'find_patient_in_ehr' && conversationState.patientStatus === 'new') {
    console.log(`[${toolNameAttempted}] Skipping find_patient_in_ehr - user confirmed new patient status`);
    return { 
      requiredNextToolName: 'create_new_patient',
      guidanceMessageKey: 'PROCEED_WITH_NEW_PATIENT_REGISTRATION' 
    };
  }
  
  // If trying to create new patient for existing patient status
  if (toolNameAttempted === 'create_new_patient' && conversationState.patientStatus === 'existing' && conversationState.identifiedPatientId) {
    console.log(`[${toolNameAttempted}] Skipping create_new_patient - patient already exists`);
    return {
      guidanceMessageKey: 'PATIENT_ALREADY_EXISTS'
    };
  }
  
  // If trying to check slots but appointment type not determined
  if (toolNameAttempted === 'check_available_slots' && !conversationState.determinedAppointmentTypeId) {
    return { 
      requiredNextToolName: 'find_appointment_type', 
      guidanceMessageKey: 'ASK_FOR_APPOINTMENT_TYPE_FIRST' 
    };
  }
  
  // If trying to book appointment, check prerequisites in order of importance
  if (toolNameAttempted === 'book_appointment') {
    // First, ensure patient is identified
    if (!conversationState.identifiedPatientId) {
      return { 
        guidanceMessageKey: 'IDENTIFY_PATIENT_FIRST' 
      };
    }
    
    // Second, ensure appointment type is determined
    if (!conversationState.determinedAppointmentTypeId) {
      return { 
        requiredNextToolName: 'find_appointment_type',
        guidanceMessageKey: 'ASK_FOR_APPOINTMENT_TYPE_FIRST' 
      };
    }
    
    // Third, ensure requested date is set
    if (!conversationState.requestedDate) {
      return { 
        guidanceMessageKey: 'ASK_FOR_DATE_FIRST' 
      };
    }
    
    // Finally, ensure a specific time slot has been selected
    if (!conversationState.selectedTimeSlot) {
      // Only trigger slot confirmation if slots were previously checked for the current date
      if (conversationState.availableSlotsForDate && conversationState.availableSlotsForDate.length > 0) {
        return { 
          guidanceMessageKey: 'CONFIRM_SLOT_FIRST' 
        };
      } else {
        // If no slots have been checked yet, guide to check slots first
        return { 
          requiredNextToolName: 'check_available_slots',
          guidanceMessageKey: 'CHECK_AVAILABILITY_FIRST' 
        };
      }
    }
  }
  
  // If trying to create new patient but should check existing patients first
  if (toolNameAttempted === 'create_new_patient' && !conversationState.identifiedPatientId) {
    // This could be acceptable in some flows, but let's allow it for now
    // return { guidanceMessageKey: 'CHECK_EXISTING_PATIENT_FIRST' };
  }
  
  // If the attempted tool is appropriate for the current state, return null
  return null;
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
    console.log('[ToolCallHandler] ConversationState before tool execution:', JSON.stringify(context.conversationState.getStateSnapshot(), null, 2));
    
    // FLOW ENFORCEMENT: Check if the tool call is appropriate for the current conversation state
    const flowCheck = getNextLogicalStep(tool.name, context.conversationState);
    if (flowCheck) {
      console.log(`[${tool.name}] Flow interception: Tool called out of sequence.`, flowCheck);
      
      const flowInterceptionResult = {
        success: false,
        error_code: "FLOW_INTERCEPTION",
        details: `Tool '${tool.name}' called out of sequence. Guiding conversation flow.`,
        flow_correction_guidance: flowCheck.guidanceMessageKey,
        data: {
          attempted_tool: tool.name,
          required_next_tool: flowCheck.requiredNextToolName,
          guidance_key: flowCheck.guidanceMessageKey
        }
      };

      // Generate a natural guidance message
      const guidanceMessage = await generateDynamicMessage(
        tool.name,
        parsedArgs,
        flowInterceptionResult
      );
      
      const resultWithGuidance = {
        success: false,
        error_code: "FLOW_INTERCEPTION", 
        message_to_patient: guidanceMessage,
        details: flowInterceptionResult.details,
        data: flowInterceptionResult.data
      };

      // Log this flow interception
      await logToolExecution(
        context,
        tool.name,
        parsedArgs,
        resultWithGuidance,
        false,
        `Flow interception: ${tool.name} called out of sequence`
      );

      return resultWithGuidance;
    }
    
    // Argument pre-population for book_appointment from ConversationState
    if (tool.name === 'book_appointment') {
      // Pre-populate arguments from ConversationState if not provided by LLM
      if (!parsedArgs.patientId && context.conversationState.identifiedPatientId) {
        console.log(`[${tool.name}] Pre-populating patientId from ConversationState: ${context.conversationState.identifiedPatientId}`);
        parsedArgs.patientId = context.conversationState.identifiedPatientId;
      }
      
      if (!parsedArgs.appointmentTypeId && context.conversationState.determinedAppointmentTypeId) {
        console.log(`[${tool.name}] Pre-populating appointmentTypeId from ConversationState: ${context.conversationState.determinedAppointmentTypeId}`);
        parsedArgs.appointmentTypeId = context.conversationState.determinedAppointmentTypeId;
      }
      
      if (!parsedArgs.requestedDate && context.conversationState.requestedDate) {
        console.log(`[${tool.name}] Pre-populating requestedDate from ConversationState: ${context.conversationState.requestedDate}`);
        parsedArgs.requestedDate = context.conversationState.requestedDate;
      }
      
      if (!parsedArgs.durationMinutes && context.conversationState.determinedDurationMinutes) {
        console.log(`[${tool.name}] Pre-populating durationMinutes from ConversationState: ${context.conversationState.determinedDurationMinutes}`);
        parsedArgs.durationMinutes = context.conversationState.determinedDurationMinutes;
      }
      
      if (!parsedArgs.selectedTime && context.conversationState.selectedTimeSlot?.display_time) {
        console.log(`[${tool.name}] Pre-populating selectedTime from ConversationState: ${context.conversationState.selectedTimeSlot.display_time}`);
        parsedArgs.selectedTime = context.conversationState.selectedTimeSlot.display_time;
      }
      
      // If user provided selectedTime but ConversationState.selectedTimeSlot is not set, try to match and update it
      if (parsedArgs.selectedTime && !context.conversationState.selectedTimeSlot && context.conversationState.availableSlotsForDate) {
        console.log(`[${tool.name}] Attempting to match selectedTime "${parsedArgs.selectedTime}" with available slots`);
        const selectedTimeStr = String(parsedArgs.selectedTime).trim();
        const matchedSlot = (context.conversationState.availableSlotsForDate as Record<string, unknown>[]).find((slot: Record<string, unknown>) => 
          slot.display_time && String(slot.display_time).toLowerCase() === selectedTimeStr.toLowerCase()
        );
        
        if (matchedSlot) {
          console.log(`[${tool.name}] Matched slot found, updating ConversationState.selectedTimeSlot:`, matchedSlot);
          context.conversationState.updateSelectedTimeSlot(matchedSlot);
          // Update parsedArgs.selectedTime with the exact display_time from the matched slot for consistency
          parsedArgs.selectedTime = String(matchedSlot.display_time);
        } else {
          console.log(`[${tool.name}] No matching slot found for selectedTime "${selectedTimeStr}" in available slots`);
        }
             }
      // This handles cases where user changes their mind or LLM provides different formatting
      if (parsedArgs.selectedTime && context.conversationState.selectedTimeSlot && context.conversationState.availableSlotsForDate) {
        const selectedTimeStr = String(parsedArgs.selectedTime).trim();
        const currentSelectedDisplay = String(context.conversationState.selectedTimeSlot.display_time || '');
        
        // If the selected time from LLM doesn't match what's stored, try to find a better match
        if (selectedTimeStr.toLowerCase() !== currentSelectedDisplay.toLowerCase()) {
          console.log(`[${tool.name}] Time mismatch detected. LLM selected: "${selectedTimeStr}", ConversationState has: "${currentSelectedDisplay}"`);
          
          const matchedSlot = (context.conversationState.availableSlotsForDate as Record<string, unknown>[]).find((slot: Record<string, unknown>) => 
            slot.display_time && String(slot.display_time).toLowerCase() === selectedTimeStr.toLowerCase()
          );
          
          if (matchedSlot) {
            console.log(`[${tool.name}] Found better matching slot, updating ConversationState.selectedTimeSlot:`, matchedSlot);
            context.conversationState.updateSelectedTimeSlot(matchedSlot);
            parsedArgs.selectedTime = String(matchedSlot.display_time);
          } else {
            console.log(`[${tool.name}] No better match found, keeping existing ConversationState.selectedTimeSlot`);
            // Keep the existing selection and update parsedArgs to match
            parsedArgs.selectedTime = currentSelectedDisplay;
          }
        }
      }
      
      // ENHANCED: Also try to match selectedTime even if ConversationState.selectedTimeSlot IS set but different
      // This handles cases where user changes their mind or LLM provides different formatting
      if (parsedArgs.selectedTime && context.conversationState.selectedTimeSlot && context.conversationState.availableSlotsForDate) {
        const selectedTimeStr = String(parsedArgs.selectedTime).trim();
        const currentSelectedDisplay = String(context.conversationState.selectedTimeSlot.display_time || '');
        
        // If the selected time from LLM doesn't match what's stored, try to find a better match
        if (selectedTimeStr.toLowerCase() !== currentSelectedDisplay.toLowerCase()) {
          console.log(`[${tool.name}] Time mismatch detected. LLM selected: "${selectedTimeStr}", ConversationState has: "${currentSelectedDisplay}"`);
          
          const matchedSlot = (context.conversationState.availableSlotsForDate as Record<string, unknown>[]).find((slot: Record<string, unknown>) => 
            slot.display_time && String(slot.display_time).toLowerCase() === selectedTimeStr.toLowerCase()
          );
          
          if (matchedSlot) {
            console.log(`[${tool.name}] Found better matching slot, updating ConversationState.selectedTimeSlot:`, matchedSlot);
            context.conversationState.updateSelectedTimeSlot(matchedSlot);
            parsedArgs.selectedTime = String(matchedSlot.display_time);
          } else {
            console.log(`[${tool.name}] No better match found, keeping existing ConversationState.selectedTimeSlot`);
            // Keep the existing selection and update parsedArgs to match
            parsedArgs.selectedTime = currentSelectedDisplay;
          }
        }
      }
      
      // Generate call summary for appointment note if not already available
      if (!context.conversationState.callSummaryForNote) {
        try {
          // For now, we'll use a placeholder since transcript extraction from VAPI may require additional setup
          // In a production environment, this would extract the transcript from the VAPI call
          const transcript: string = ""; // TODO: Extract transcript from VAPI call when available
          if (transcript.trim() !== "") {
            console.log(`[${tool.name}] Generating call summary from transcript...`);
            const summary = await generateCallSummaryForNote(transcript);
            context.conversationState.setCallSummary(summary);
            console.log(`[${tool.name}] Call summary generated: ${summary}`);
          } else {
            console.log(`[${tool.name}] No transcript available, using default summary`);
            context.conversationState.setCallSummary("Appointment scheduled via Laine AI");
          }
        } catch (error) {
          console.error(`[${tool.name}] Error generating call summary:`, error);
          context.conversationState.setCallSummary("Appointment scheduled via Laine AI");
        }
      }
    }
    
    // Check prerequisites before executing tool
    if (tool.prerequisites && tool.prerequisites.length > 0) {
      for (const prereq of tool.prerequisites) {
        // Check if the prerequisite argument is present in parsedArgs AND is not obviously empty/null.
        const argValueFromLlm = parsedArgs[prereq.argName];
        let actualArgValue = argValueFromLlm; // Value from LLM's current arguments

        // ENHANCED: First check ConversationState for the prerequisite
        if (actualArgValue === undefined || actualArgValue === null || (typeof actualArgValue === 'string' && actualArgValue.trim() === '')) {
          // Check ConversationState for common prerequisites
          if (prereq.argName === 'appointmentTypeId' && context.conversationState.determinedAppointmentTypeId) {
            console.log(`[${tool.name}] Prerequisite '${prereq.argName}' not in LLM args, but found in ConversationState: ${context.conversationState.determinedAppointmentTypeId}`);
            actualArgValue = context.conversationState.determinedAppointmentTypeId;
            parsedArgs[prereq.argName] = actualArgValue;
          } else if (prereq.argName === 'patientId' && context.conversationState.identifiedPatientId) {
            console.log(`[${tool.name}] Prerequisite '${prereq.argName}' not in LLM args, but found in ConversationState: ${context.conversationState.identifiedPatientId}`);
            actualArgValue = context.conversationState.identifiedPatientId;
            parsedArgs[prereq.argName] = actualArgValue;
          } else if (prereq.argName === 'requestedDate' && context.conversationState.requestedDate) {
            console.log(`[${tool.name}] Prerequisite '${prereq.argName}' not in LLM args, but found in ConversationState: ${context.conversationState.requestedDate}`);
            actualArgValue = context.conversationState.requestedDate;
            parsedArgs[prereq.argName] = actualArgValue;
          }
          // Fallback to callLogContextData if still not found
          else if (prereq.argName === 'patientId' && callLogContextData?.nexhealthPatientId) {
            console.log(`[${tool.name}] Prerequisite '${prereq.argName}' not in ConversationState, but found in CallLog context: ${callLogContextData.nexhealthPatientId}`);
            actualArgValue = callLogContextData.nexhealthPatientId;
            parsedArgs[prereq.argName] = actualArgValue;
          }
        }

        const isArgStillMissingOrEmpty = actualArgValue === undefined || actualArgValue === null || (typeof actualArgValue === 'string' && actualArgValue.trim() === '');

        if (isArgStillMissingOrEmpty) {
          console.log(`[${tool.name}] Prerequisite missing: ${prereq.argName}. Prompting user.`);

          const prerequisiteFailureResult = {
            success: false as const, // Mark as not successful for the tool's main goal
            error_code: "PREREQUISITE_MISSING" as string,
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
    
    // Pre-validation removed - create_new_patient now handles staged collection internally
    
    // Validate arguments with tool schema
    const validatedArgs = tool.schema.parse(parsedArgs);
    
    const toolResult = await tool.run({
      args: validatedArgs,
      context
    });
    
    // Log ConversationState after successful tool execution (if state might have changed)
    if (toolResult.success && ['find_patient_in_ehr', 'create_new_patient', 'find_appointment_type', 'check_available_slots', 'book_appointment'].includes(tool.name)) {
      console.log('[ToolCallHandler] ConversationState after successful tool execution:', JSON.stringify(context.conversationState.getStateSnapshot(), null, 2));
    }
    
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

// validateCreateNewPatientArgs and related helper functions removed - 
// create_new_patient tool now handles staged collection internally

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
    
    // Initialize ConversationState
    const conversationState = new ConversationState(practice.id, vapiCallId, assistantId);
    
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
        select: { 
          nexhealthPatientId: true,
          lastAppointmentTypeId: true,
          lastAppointmentTypeName: true,
          lastAppointmentDuration: true
        } // Fetch context data for prerequisites and state loading
      });
      
      callLogContextData = updatedCallLog;
      console.log(`[ToolCallHandler] Fetched CallLog context:`, callLogContextData);
      
      // Load existing state from CallLog
      if (callLogContextData?.lastAppointmentTypeId && callLogContextData?.lastAppointmentTypeName && callLogContextData?.lastAppointmentDuration) {
        conversationState.updateAppointmentType(
          callLogContextData.lastAppointmentTypeId,
          callLogContextData.lastAppointmentTypeName,
          callLogContextData.lastAppointmentDuration
        );
        console.log(`[ToolCallHandler] Loaded appointment type from CallLog: ${callLogContextData.lastAppointmentTypeName}`);
      }
      if (callLogContextData?.nexhealthPatientId) {
        conversationState.updatePatient(callLogContextData.nexhealthPatientId);
        console.log(`[ToolCallHandler] Loaded patient ID from CallLog: ${callLogContextData.nexhealthPatientId}`);
      }
    } catch (dbError) {
      console.error("Error updating CallLog:", dbError);
      // Try to fetch existing call log context data separately
      try {
        const existingCallLog = await prisma.callLog.findUnique({
          where: { vapiCallId: vapiCallId },
          select: { 
            nexhealthPatientId: true,
            lastAppointmentTypeId: true,
            lastAppointmentTypeName: true,
            lastAppointmentDuration: true
          }
        });
        if (existingCallLog) {
          callLogContextData = existingCallLog;
          console.log(`[ToolCallHandler] Fetched existing CallLog context:`, callLogContextData);
          
          // Load existing state from existing CallLog
          if (existingCallLog.lastAppointmentTypeId && existingCallLog.lastAppointmentTypeName && existingCallLog.lastAppointmentDuration) {
            conversationState.updateAppointmentType(
              existingCallLog.lastAppointmentTypeId,
              existingCallLog.lastAppointmentTypeName,
              existingCallLog.lastAppointmentDuration
            );
          }
          if (existingCallLog.nexhealthPatientId) {
            conversationState.updatePatient(existingCallLog.nexhealthPatientId);
          }
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
        conversationState, // Pass the conversation state
      };
      
      const toolResult = await executeToolSafely(tool, toolCall, context, callLogContextData);
      
      // Update CallLog with findAppointmentType results
      if (tool.name === 'find_appointment_type' && toolResult.success && 'data' in toolResult && toolResult.data?.matched) {
        try {
          await prisma.callLog.update({
            where: { vapiCallId: context.vapiCallId },
            data: {
              // IMPORTANT: Store the Laine CUID for internal tracking
              lastAppointmentTypeId: context.conversationState.determinedAppointmentTypeId,
              lastAppointmentTypeName: context.conversationState.determinedAppointmentTypeName,
              lastAppointmentDuration: context.conversationState.determinedDurationMinutes,
              updatedAt: new Date()
            }
          });
          console.log(`[ToolCallHandler] Updated CallLog for ${context.vapiCallId} with appointment type: ${context.conversationState.determinedAppointmentTypeName}`);
        } catch (dbError) {
          console.error(`[ToolCallHandler] Error updating CallLog with appointment type for ${context.vapiCallId}:`, dbError);
        }
      }
      
      let vapiToolResponseItem: any; // eslint-disable-line @typescript-eslint/no-explicit-any

      const currentConversationStateSnapshot = context.conversationState.getStateSnapshot();

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
          // ADD THIS: Include conversation state snapshot for VAPI LLM to maintain context
          conversationState: currentConversationStateSnapshot
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
          // ADD THIS: Include conversation state snapshot for VAPI LLM to maintain context
          conversationState: currentConversationStateSnapshot
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