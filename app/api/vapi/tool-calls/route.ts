import { NextRequest, NextResponse } from "next/server";
import { getToolByName } from "@/lib/tools";
import { prisma } from "@/lib/prisma";
import { VapiServerMessage, VapiToolCall, ToolExecutionContext, ToolDefinition } from "@/lib/tools/types";
import { getErrorCode, getPatientMessage } from "@/lib/tools/error-messages";

async function findPracticeByAssistantId(assistantId: string) {
  if (!assistantId) return null;
  
  try {
    const assistantConfig = await prisma.practiceAssistantConfig.findUnique({
      where: { vapiAssistantId: assistantId },
      include: { 
        practice: {
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
        }
      }
    });
    
    if (!assistantConfig?.practice) {
      return null;
    }

    return assistantConfig.practice;
  } catch (error) {
    console.error("Error finding practice by assistant ID:", error);
    return null;
  }
}

async function executeToolSafely(
  // Use more flexible typing to avoid constraint issues
  tool: ToolDefinition<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  toolCall: VapiToolCall,
  context: ToolExecutionContext
) {
  try {
    const parsedArgs = JSON.parse(toolCall.arguments);
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
      toolCall.arguments,
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
    
    const payload: VapiServerMessage = await req.json();
    console.log("VAPI payload:", JSON.stringify(payload, null, 2));
    
    // Validate payload structure
    if (!payload.message || payload.message.type !== "tool-calls") {
      console.error("Invalid payload type:", payload.message?.type);
      return NextResponse.json({ error: "Invalid payload type" }, { status: 400 });
    }
    
    const { message } = payload;
    const vapiCallId = message.call.id;
    const assistantId = message.call.assistantId || message.assistant.id;
    
    // Find practice by assistant ID with scheduling data
    const practice = await findPracticeByAssistantId(assistantId);
    if (!practice) {
      console.error(`No practice found for assistant ID: ${assistantId}`);
      
      // Return error results for all tool calls
      const errorResults = message.toolCallList.map(toolCall => ({
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
    
    for (const toolCall of message.toolCallList) {
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
        assistantId
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