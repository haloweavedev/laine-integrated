import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleCreatePatientRecord } from '@/lib/tool-handlers/createPatientRecordHandler';
import { handleFindAndConfirmPatient } from '@/lib/tool-handlers/findAndConfirmPatientHandler';
import { handleFindAppointmentType } from '@/lib/tool-handlers/findAppointmentTypeHandler';
import { handleCheckAvailableSlots } from '@/lib/tool-handlers/checkAvailableSlotsHandler';
import { handleConfirmBooking } from '@/lib/tool-handlers/confirmBookingHandler';
import { handleSelectAndConfirmSlot } from '@/lib/tool-handlers/selectAndConfirmSlotHandler';
import { Liquid } from 'liquidjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { 
  ServerMessageToolCallsPayload, 
  ConversationState,
  HandlerResult,
  ServerMessageToolCallItem
} from '@/types/vapi';
import { Prisma } from '@prisma/client';

export async function POST(request: Request) {
  const startTime = Date.now();
  let handlerResult: HandlerResult | undefined;
  let toolCall: ServerMessageToolCallItem | undefined;

  try {
    const body: ServerMessageToolCallsPayload = await request.json();
    const message = body.message;

    if (message?.type !== 'tool-calls') {
      return NextResponse.json({ message: "Ignoring non-tool-call message" });
    }

    // Extract the first tool call and call ID
    toolCall = message.toolCallList?.[0] || message.toolCalls?.[0];
    const callId = message.call.id;

    if (!toolCall || !callId) {
      console.error("[VAPI Webhook] Malformed payload, missing toolCall or callId:", message);
      return NextResponse.json({ 
        results: [{ toolCallId: "unknown", error: "Malformed tool call payload from VAPI." }] 
      }, { status: 200 });
    }

    // Get practice ID for database operations
    const firstPractice = await prisma.practice.findFirst();
    const practiceId = firstPractice?.id ?? "unknown";

    // Ensure callLog exists
    await prisma.callLog.upsert({
      where: { vapiCallId: callId },
      update: { updatedAt: new Date() },
      create: {
        vapiCallId: callId,
        practiceId: practiceId,
        callStatus: "TOOL_INTERACTION_STARTED",
        callTimestampStart: new Date(),
      },
    });

    // State management: retrieve or initialize conversation state
    let state: ConversationState;
    const callLog = await prisma.callLog.findUniqueOrThrow({ where: { vapiCallId: callId } });

    if (callLog.conversationState && typeof callLog.conversationState === 'object' && callLog.conversationState !== null) {
      state = callLog.conversationState as unknown as ConversationState;
      console.log(`[State Management] Retrieved state for call: ${callId}`);
    } else {
      state = {
        callId: callId,
        practiceId: practiceId,
        appointmentBooking: {},
        patientDetails: {
          collectedInfo: {}
        }
      };
      console.log(`[State Management] Initialized new state for call: ${callId}`);
    }

    // Get tool name and arguments
    const toolName = toolCall.function.name;
    let toolArguments = toolCall.function.arguments;

    if (typeof toolArguments === 'string') {
      try {
        toolArguments = JSON.parse(toolArguments);
      } catch (e) {
        console.error(`[VAPI Webhook] Failed to parse tool arguments string:`, e);
        return NextResponse.json({ 
          results: [{ toolCallId: toolCall.id, error: `Failed to parse arguments for tool ${toolName}.` }] 
        }, { status: 200 });
      }
    }

    console.log(`[VAPI Webhook] Processing tool: ${toolName} (ID: ${toolCall.id}) for Call: ${callId}`);
    console.log(`[VAPI Webhook] Arguments:`, toolArguments);

    // Create initial tool log entry
    try {
      await prisma.toolLog.create({
        data: {
          practiceId: practiceId,
          vapiCallId: callId,
          toolName: toolName,
          toolCallId: toolCall.id,
          arguments: JSON.stringify(toolArguments),
          stateBefore: JSON.stringify(state),
          success: false, // Default to false, will be updated on success
          createdAt: new Date(startTime),
          updatedAt: new Date(startTime),
        }
      });
      console.log(`[DB Log] Created initial ToolLog for ID: ${toolCall.id}`);
    } catch (logError) {
      console.error('[DB Log] Failed to create initial tool log:', logError);
    }

    console.log('[VAPI Webhook] State before processing:', JSON.stringify(state, null, 2));

    // Tool routing switch statement  
    switch (toolName) {
      case "findAppointmentType": {
        handlerResult = await handleFindAppointmentType(
          state,
          toolArguments as { patientRequest: string; patientStatus?: string },
          toolCall.id
        );
        break;
      }

      case "checkAvailableSlots": {
        handlerResult = await handleCheckAvailableSlots(
          state,
          toolArguments as { preferredDaysOfWeek?: string; timeBucket?: string; requestedDate?: string },
          toolCall.id
        );
        break;
      }

      case "confirmBooking": {
        handlerResult = await handleConfirmBooking(
          state,
          toolCall.id
        );
        break;
      }

      case "create_patient_record": {
        handlerResult = await handleCreatePatientRecord(
          state,
          toolArguments as {
            firstName: string;
            lastName: string;
            dateOfBirth: string;
            phoneNumber: string;
            email: string;
          },
          toolCall.id
        );
        break;
      }

      case "findAndConfirmPatient": {
        handlerResult = await handleFindAndConfirmPatient(
          state,
          toolArguments as {
            fullName: string;
            dateOfBirth: string;
          },
          toolCall.id
        );
        break;
      }

      case "selectAndConfirmSlot": {
        handlerResult = await handleSelectAndConfirmSlot(
          state,
          toolArguments as { userSelection: string },
          toolCall.id
        );
        break;
      }

      default: {
        console.error(`[VAPI Webhook] Unknown tool: ${toolName}`);
        handlerResult = {
          toolResponse: {
            toolCallId: toolCall.id,
            error: `I'm sorry, I don't know how to handle the "${toolName}" tool. Please try again.`
          },
          newState: state
        };
        break;
      }
    }

    if (!handlerResult) {
      // This case should ideally not be reached if all tools are handled.
      console.error(`[VAPI Webhook] No handler result for tool: ${toolName}`);
      return NextResponse.json({ 
        results: [{ toolCallId: toolCall.id, error: "Internal error: tool handler did not produce a result." }] 
      }, { status: 200 });
    }

    // Tool chaining is no longer needed with the new consolidated selectAndConfirmSlot tool

    console.log('[VAPI Webhook] Final handler result after processing:', JSON.stringify(handlerResult, null, 2));
    
    // Use the exact newState object from the handler's result for all subsequent operations.
    const newState = handlerResult.newState;

    // Atomically save the new, complete state to the database.
    await prisma.callLog.update({
      where: { vapiCallId: callId },
      data: { conversationState: newState as unknown as Prisma.InputJsonValue }
    });
    console.log(`[State Management] Persisted state for call: ${callId}`);

    // Render the system prompt using the guaranteed fresh state.
    try {
      const liquid = new Liquid();
      const promptPath = join(process.cwd(), 'lib/system-prompt/laine_system_prompt.md');
      const promptTemplate = readFileSync(promptPath, 'utf-8');
      
      const renderedSystemPrompt = await liquid.parseAndRender(promptTemplate, newState);
      
      console.log(`[State Injection] Successfully rendered system prompt with fresh state`);

      // Construct and return the final response for VAPI
      return NextResponse.json({ 
        results: [handlerResult.toolResponse],
        systemPrompt: renderedSystemPrompt
      });
    } catch (promptError) {
      console.error('[State Injection] Error rendering system prompt:', promptError);
      
      // Fallback to original response without state injection
      return NextResponse.json({ results: [handlerResult.toolResponse] });
    }

  } catch (error) {
    console.error('Error in VAPI webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    if (toolCall?.id && startTime && handlerResult) {
      const executionTimeMs = Date.now() - startTime;
      const isSuccess = !!handlerResult.toolResponse?.message && handlerResult.toolResponse.message.type !== 'request-failed';

      try {
        await prisma.toolLog.updateMany({
          where: { toolCallId: toolCall.id },
          data: {
            result: handlerResult?.toolResponse?.result ? JSON.stringify(handlerResult.toolResponse.result, null, 2) : undefined,
            error: !isSuccess ? JSON.stringify(handlerResult?.toolResponse, null, 2) : undefined,
            success: isSuccess,
            executionTimeMs: executionTimeMs,
            apiResponses: handlerResult?.toolResponse?.result && typeof handlerResult.toolResponse.result === 'object' && 'apiLog' in handlerResult.toolResponse.result ? JSON.stringify(handlerResult.toolResponse.result.apiLog, null, 2) : undefined,
            updatedAt: new Date(),
          }
        });
        console.log(`[DB Log] Finalized ToolLog for ID: ${toolCall.id} with success: ${isSuccess}`);
      } catch (logError) {
        console.error('[DB Log] Failed to finalize tool log:', logError);
      }
    }
  }
} 