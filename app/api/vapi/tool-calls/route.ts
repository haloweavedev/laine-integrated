import { NextRequest, NextResponse } from "next/server";
import { getToolByName } from "@/lib/tools";
import { prisma } from "@/lib/prisma";
import { ToolExecutionContext, ToolDefinition } from "@/lib/tools/types";
import { getErrorCode, getPatientMessage } from "@/lib/tools/error-messages";

// Type for VAPI payload (flexible to handle various structures)
interface VapiPayload {
  message: {
    type: string;
    call: {
      id: string;
      assistantId?: string;
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

// Enhanced function to extract assistant ID from various possible locations
function extractAssistantId(payload: any): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { message } = payload;
  
  console.log("=== Assistant ID Extraction Debug ===");
  console.log("Call object keys:", Object.keys(message.call || {}));
  console.log("Assistant object keys:", Object.keys(message.assistant || {}));
  
  // Method 1: Check call.assistantId (original expectation)
  if (message.call?.assistantId) {
    console.log("✅ Found assistantId in call.assistantId:", message.call.assistantId);
    return message.call.assistantId;
  }
  
  // Method 2: Check assistant.id (fallback)
  if (message.assistant?.id) {
    console.log("✅ Found assistantId in assistant.id:", message.assistant.id);
    return message.assistant.id;
  }
  
  // Method 3: Check for assistant object with different structure
  if ((message.assistant as any)?.assistant?.id) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log("✅ Found assistantId in assistant.assistant.id:", (message.assistant as any).assistant.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    return (message.assistant as any).assistant.id; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  
  // Method 4: Check call object for nested assistant info
  if ((message.call as any)?.assistant?.id) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log("✅ Found assistantId in call.assistant.id:", (message.call as any).assistant.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    return (message.call as any).assistant.id; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  
  console.log("❌ No assistant ID found in payload");
  console.log("Available call fields:", message.call);
  console.log("Available assistant fields:", message.assistant);
  
  return null;
}

// Enhanced practice lookup with fallback strategies
async function findPracticeByAssistantId(assistantId: string | null, payload: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  console.log("=== Practice Lookup Debug ===");
  console.log("Assistant ID:", assistantId);
  
  if (!assistantId) {
    console.log("🔄 Attempting to find practice using alternative methods...");
    
    // Fallback 1: Try to find by assistant name
    const assistantName = (payload.message.assistant as any)?.name; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (assistantName) {
      console.log("🔄 Attempting lookup by assistant name:", assistantName);
      try {
        // Try exact match first
        let assistantConfig = await prisma.practiceAssistantConfig.findFirst({
          where: {
            practice: {
              name: assistantName.split(" - ")[0] // Extract practice name from "Practice - Laine"
            }
          },
          include: { 
            practice: true
          }
        });
        
        // If no exact match, try partial match
        if (!assistantConfig && assistantName.includes(" - ")) {
          const practiceName = assistantName.split(" - ")[0];
          assistantConfig = await prisma.practiceAssistantConfig.findFirst({
            where: {
              practice: {
                name: {
                  contains: practiceName,
                  mode: 'insensitive'
                }
              }
            },
            include: { 
              practice: true
            }
          });
        }
        
        if (assistantConfig?.practice) {
          console.log("✅ Found practice by assistant name:", assistantConfig.practice.id);
          return await fetchPracticeWithSchedulingData(assistantConfig.practice.id);
        }
      } catch (error) {
        console.error("❌ Error looking up by assistant name:", error);
      }
    }
    
    // Fallback 2: For development/testing - use the first available practice
    if (process.env.NODE_ENV === 'development') {
      console.log("🔄 Development mode: Using first available practice");
      try {
        const firstPractice = await prisma.practice.findFirst({
          include: { assistantConfig: true }
        });
        
        if (firstPractice) {
          console.log("✅ Using development practice:", firstPractice.id);
          return await fetchPracticeWithSchedulingData(firstPractice.id);
        }
      } catch (error) {
        console.error("❌ Error using development fallback:", error);
      }
    }
    
    // Fallback 3: Check if there's only one practice configured
    try {
      const practiceCount = await prisma.practice.count();
      if (practiceCount === 1) {
        console.log("🔄 Only one practice found, using it as fallback");
        const singlePractice = await prisma.practice.findFirst();
        if (singlePractice) {
          console.log("✅ Using single practice:", singlePractice.id);
          return await fetchPracticeWithSchedulingData(singlePractice.id);
        }
      }
    } catch (error) {
      console.error("❌ Error checking single practice fallback:", error);
    }
    
    return null;
  }
  
  try {
    const assistantConfig = await prisma.practiceAssistantConfig.findUnique({
      where: { vapiAssistantId: assistantId },
      include: { 
        practice: true
      }
    });
    
    if (!assistantConfig?.practice) {
      console.error(`❌ No practice found for assistant ID: ${assistantId}`);
      return null;
    }

    console.log("✅ Found practice by assistant ID:", assistantConfig.practice.id);
    return await fetchPracticeWithSchedulingData(assistantConfig.practice.id);
  } catch (error) {
    console.error("❌ Error finding practice by assistant ID:", error);
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

async function executeToolSafely(
  // Use more flexible typing to avoid constraint issues
  tool: ToolDefinition<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  toolCall: any, // eslint-disable-line @typescript-eslint/no-explicit-any 
  context: ToolExecutionContext
) {
  try {
    const parsedArgs = extractToolCallArguments(toolCall);
    const startTime = Date.now();
    
    console.log(`Executing tool: ${tool.name} for practice ${context.practice.id} with args:`, parsedArgs);
    
    // Validate arguments with tool schema
    const validatedArgs = tool.schema.parse(parsedArgs);
    
    const toolResult = await tool.run({
      args: validatedArgs,
      context
    });
    
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
      error_code: getErrorCode(error),
      message_to_patient: getPatientMessage(getErrorCode(error)),
      details: error instanceof Error ? error.message : "Unknown error"
    };
    
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
    const assistantId = extractAssistantId(payload);
    
    // Find practice by assistant ID with scheduling data
    const practice = await findPracticeByAssistantId(assistantId, payload);
    if (!practice) {
      console.error(`No practice found for assistant ID: ${assistantId}`);
      
      // Return error results for all tool calls
      const errorResults = (message.toolCallList || []).map(toolCall => ({
        toolCallId: toolCall.toolCallId,
        result: JSON.stringify({
          success: false,
          error_code: "PRACTICE_NOT_FOUND",
          message_to_patient: getPatientMessage("PRACTICE_NOT_FOUND")
        })
      }));
      
      return NextResponse.json({ results: errorResults });
    }
    
    // Update call log status
    try {
      await prisma.callLog.upsert({
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
        }
      });
    } catch (dbError) {
      console.error("Error updating CallLog:", dbError);
    }
    
    // Process all tool calls
    const results = [];
    
    for (const toolCall of (message.toolCallList || [])) {
      const tool = getToolByName(toolCall.name);
      
      if (!tool) {
        console.error(`Unknown tool: ${toolCall.name}`);
        results.push({
          toolCallId: toolCall.toolCallId,
          result: JSON.stringify({
            success: false,
            error_code: "SYSTEM_ERROR",
            message_to_patient: getPatientMessage("SYSTEM_ERROR")
          })
        });
        continue;
      }
      
      // Create execution context
      const context: ToolExecutionContext = {
        practice,
        vapiCallId,
        toolCallId: toolCall.toolCallId,
        assistantId: assistantId || "unknown"
      };
      
      const toolResult = await executeToolSafely(tool, toolCall, context);
      
      results.push({
        toolCallId: toolCall.toolCallId,
        result: JSON.stringify(toolResult)
      });
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