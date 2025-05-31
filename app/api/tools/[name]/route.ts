import { NextRequest, NextResponse } from "next/server";
import { verifyVapiRequest } from "@/lib/vapi";
import { prisma } from "@/lib/prisma";
import { getToolByName } from "@/lib/tools";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  console.log(`=== VAPI Tool Handler: ${name} ===`);
  
  try {
    // Verify the webhook (when VAPI supports request signing)
    const verification = await verifyVapiRequest();
    if (!verification.verified) {
      console.error("VAPI tool call verification failed:", verification.error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    console.log(`Tool call payload for ${name}:`, JSON.stringify(payload, null, 2));

    // Validate that this is a tool-call webhook
    if (payload.type !== "tool-calls") {
      console.error(`Unexpected payload type: ${payload.type}`);
      return NextResponse.json({ error: "Invalid payload type" }, { status: 400 });
    }

    // Find the practice by assistant ID
    const practice = await findPracticeByAssistantId(payload.call?.assistantId);
    if (!practice) {
      console.error("Practice not found for assistant:", payload.call?.assistantId);
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Get the tool definition
    const tool = getToolByName(name);
    if (!tool) {
      console.error(`Tool not found: ${name}`);
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }

    // Process all tool calls in the request
    const results = [];
    
    for (const toolCall of payload.toolCalls || []) {
      if (toolCall.function?.name !== name) {
        console.error(`Tool name mismatch: expected ${name}, got ${toolCall.function?.name}`);
        results.push({
          toolCallId: toolCall.id,
          result: JSON.stringify({
            success: false,
            error: "Tool name mismatch",
            message: "Sorry, I had a technical issue. Please try again."
          })
        });
        continue;
      }

      try {
        // Parse arguments
        const parsedArgs = typeof toolCall.arguments === 'string' 
          ? JSON.parse(toolCall.arguments) 
          : toolCall.arguments;

        console.log(`Executing tool ${name} with args:`, parsedArgs);
        
        // Execute the tool
        const toolResult = await tool.run({
          args: parsedArgs,
          practice,
          vapiCallId: payload.call?.id
        });

        // Log the tool execution
        await logToolExecution(
          practice.id,
          payload.call?.id,
          name,
          toolCall.id,
          parsedArgs,
          toolResult,
          true
        );

        results.push({
          toolCallId: toolCall.id,
          result: JSON.stringify(toolResult)
        });

        console.log(`Tool ${name} executed successfully:`, toolResult);
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        
        // Log the failed execution
        await logToolExecution(
          practice.id,
          payload.call?.id,
          name,
          toolCall.id,
          toolCall.arguments,
          null,
          false,
          error instanceof Error ? error.message : "Unknown error"
        );

        results.push({
          toolCallId: toolCall.id,
          result: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            message: "I encountered an issue while processing your request. Please try again."
          })
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error(`Error in tool handler for ${name}:`, error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}

async function findPracticeByAssistantId(assistantId: string) {
  if (!assistantId) {
    console.error("No assistant ID provided");
    return null;
  }

  try {
    const assistantConfig = await prisma.practiceAssistantConfig.findUnique({
      where: { vapiAssistantId: assistantId },
      include: { practice: true }
    });

    if (!assistantConfig) {
      console.error(`No practice found for assistant ID: ${assistantId}`);
      return null;
    }

    return assistantConfig.practice;
  } catch (error) {
    console.error("Error finding practice by assistant ID:", error);
    return null;
  }
}

async function logToolExecution(
  practiceId: string,
  vapiCallId: string | undefined,
  toolName: string,
  toolCallId: string,
  arguments_: Record<string, unknown>,
  result: Record<string, unknown> | null,
  success: boolean,
  error?: string
) {
  try {
    const startTime = Date.now();
    
    await prisma.toolLog.create({
      data: {
        practiceId,
        vapiCallId,
        toolName,
        toolCallId,
        arguments: JSON.stringify(arguments_),
        result: result ? JSON.stringify(result) : null,
        success,
        error,
        executionTimeMs: Date.now() - startTime
      }
    });

    console.log("Tool execution logged:", {
      practiceId,
      vapiCallId,
      toolName,
      toolCallId,
      success,
      error
    });
  } catch (logError) {
    console.error("Error logging tool execution:", logError);
    // Fallback to console logging if database fails
    console.log("Tool execution log (fallback):", {
      practiceId,
      vapiCallId,
      toolName,
      toolCallId,
      arguments: JSON.stringify(arguments_),
      result: result ? JSON.stringify(result) : null,
      success,
      error,
      timestamp: new Date().toISOString()
    });
  }
} 