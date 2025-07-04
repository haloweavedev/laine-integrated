import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleFindAppointmentType } from "@/lib/tool-handlers/findAppointmentTypeHandler";
import { handleCheckAvailableSlots } from "@/lib/tool-handlers/checkAvailableSlotsHandler";
import { handleBookAppointment } from "@/lib/tool-handlers/bookAppointmentHandler";
import type { 
  ServerMessageToolCallsPayload, 
  VapiToolResult,
  ServerMessageToolCallItem,
  ConversationState,
  ConversationStage
} from "@/types/vapi";
import { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  // Variables to track timing and state for ToolLog
  let startTime: number | undefined;
  let toolCallItem: ServerMessageToolCallItem | undefined;
  let callId: string | undefined;
  let practiceId: string | null = null;
  let toolResponse: VapiToolResult | undefined;
  let toolName: string | undefined;
  let toolArguments: Record<string, unknown> | string | undefined;
  let toolId: string | undefined;

  try {
    const body: ServerMessageToolCallsPayload = await request.json();
    console.log("[VAPI Tool Handler] Incoming tool call payload:", JSON.stringify(body, null, 2));

    toolCallItem = body.message.toolCallList?.[0] || body.message.toolCalls?.[0];
    callId = body.message.call.id;

    if (!toolCallItem || !callId) {
      console.error("[VAPI Tool Handler] Malformed payload, missing toolCallItem or callId:", body.message);
      return NextResponse.json({ results: [{ toolCallId: "unknown", error: "Malformed tool call payload from VAPI." }] }, { status: 200 });
    }

    toolId = toolCallItem.id;
    toolName = toolCallItem.function.name;
    toolArguments = toolCallItem.function.arguments;

    if (typeof toolArguments === 'string') {
      try {
        toolArguments = JSON.parse(toolArguments);
      } catch (e) {
        console.error(`[VAPI Tool Handler] Failed to parse tool arguments string:`, e);
        return NextResponse.json({ results: [{ toolCallId: toolId, error: `Failed to parse arguments for tool ${toolName}.` }] }, { status: 200 });
      }
    }

    console.log(`[VAPI Tool Handler] Processing tool: ${toolName} (ID: ${toolId}) for Call: ${callId}`);
    console.log(`[VAPI Tool Handler] Arguments:`, toolArguments);

    startTime = Date.now();

    const firstPractice = await prisma.practice.findFirst();
    practiceId = firstPractice?.id ?? null;

    await prisma.callLog.upsert({
      where: { vapiCallId: callId },
      update: { updatedAt: new Date() },
      create: {
        vapiCallId: callId,
        practiceId: practiceId || "unknown",
        callStatus: "TOOL_INTERACTION_STARTED",
        callTimestampStart: new Date(startTime),
      },
    });

    await prisma.toolLog.create({
      data: {
        practiceId: practiceId || "unknown",
        vapiCallId: callId,
        toolName: toolName,
        toolCallId: toolId,
        arguments: JSON.stringify(toolArguments),
        success: false, // Will be updated in finally block
        createdAt: new Date(startTime),
        updatedAt: new Date(startTime),
      }
    });

    // === STATE MANAGEMENT LOGIC (REFACTORED & TYPE-SAFE) ===
    let state: ConversationState;
    const callLog = await prisma.callLog.findUniqueOrThrow({ where: { vapiCallId: callId } });

    if (callLog.conversationState && typeof callLog.conversationState === 'object' && callLog.conversationState !== null) {
      // The 'as unknown' is a necessary evil here because Prisma's JsonValue can be null/string/etc.
      // But our runtime check ensures it's a valid object before casting.
      state = callLog.conversationState as unknown as ConversationState;
      console.log(`[State Management] Retrieved state for call: ${callId}, stage: ${state.currentStage}`);
    } else {
      const initialStage: ConversationStage = 'GREETING';
      state = {
        currentStage: initialStage,
        callId: callId,
        practiceId: practiceId || "unknown",
        appointmentBooking: {},
        patientDetails: { nexhealthPatientId: 379724872 } // Demo Patient ID
      };
      console.log(`[State Management] Initialized new state for call: ${callId}`);
    }

    // Process tool calls based on tool name
    switch (toolName) {
      case "findAppointmentType": {
        const result = await handleFindAppointmentType(
          state, 
          toolArguments as { patientRequest: string; patientStatus?: string },
          toolId
        );
        toolResponse = result.toolResponse;
        state = result.newState;
        break;
      }

      case "checkAvailableSlots": {
        const result = await handleCheckAvailableSlots(
          state,
          toolArguments as { preferredDaysOfWeek?: string; timeBucket?: string; requestedDate?: string },
          toolId
        );
        toolResponse = result.toolResponse;
        state = result.newState;
        break;
      }

      case "bookAppointment": {
        const result = await handleBookAppointment(
          state,
          toolArguments as { userSelection: string },
          toolId
        );
        toolResponse = result.toolResponse;
        state = result.newState;
        break;
      }
      
      default: {
        console.error(`[VAPI Tool Handler] Unknown tool: ${toolName}`);
        toolResponse = {
          toolCallId: toolId!,
          error: `Unknown tool: ${toolName}`
        };
        break;
      }
    }

    // === STATE PERSISTENCE LOGIC (REFACTORED & TYPE-SAFE) ===
    if (toolResponse && state) {
        await prisma.callLog.update({
          where: { vapiCallId: callId },
          // The fix is here: explicitly casting to Prisma.InputJsonValue
          data: { conversationState: state as unknown as Prisma.InputJsonValue }
        });
        console.log(`[State Management] Persisted state for call: ${callId}, stage: ${state.currentStage}`);
    }

    console.log(`[VAPI Tool Handler] Final tool response:`, toolResponse);
    return NextResponse.json({ results: [toolResponse] }, { status: 200 });

  } catch (error) {
    console.error("[VAPI Tool Handler] Unhandled error in POST handler:", error);
    
    if (!toolResponse && toolId) {
      toolResponse = { toolCallId: toolId, error: "Internal server error processing tool call" };
    }
    
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" }, 
      { status: 500 }
    );
  } finally {
    // Update ToolLog with final outcome
    if (toolId && startTime !== undefined && toolResponse) {
        const executionTimeMs = Date.now() - startTime;
        await prisma.toolLog.updateMany({
        where: { toolCallId: toolId },
          data: {
          result: toolResponse.result,
          error: toolResponse.error,
            success: !toolResponse.error,
            executionTimeMs,
          }
        });
      console.log(`[DB Log] Finalized ToolLog for ID: ${toolId} with success: ${!toolResponse.error}`);
    }
  }
} 