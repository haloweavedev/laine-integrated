import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleCreatePatientRecord } from '@/lib/tool-handlers/createPatientRecordHandler';
import type { 
  ServerMessageToolCallsPayload, 
  ConversationState,
  PatientRecordStatus
} from '@/types/vapi';
import { Prisma } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const body: ServerMessageToolCallsPayload = await request.json();
    const message = body.message;

    if (message?.type !== 'tool-calls') {
      return NextResponse.json({ message: "Ignoring non-tool-call message" });
    }

    // Extract the first tool call and call ID
    const toolCall = message.toolCallList?.[0] || message.toolCalls?.[0];
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
      console.log(`[State Management] Retrieved state for call: ${callId}, stage: ${state.currentStage}`);
    } else {
      state = {
        currentStage: 'GREETING',
        callId: callId,
        practiceId: practiceId,
        appointmentBooking: {},
        patientDetails: {
          status: 'AWAITING_IDENTIFIER' as PatientRecordStatus,
          collectedInfo: {},
          nextInfoToCollect: null // We no longer manage this step-by-step
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

    // Tool routing switch statement  
    let handlerResponse: { result?: { nexhealthPatientId: number }; message?: { type: string; role: string; content: string } };

    switch (toolName) {
      case "create_patient_record": {
        // Cast toolArguments to the expected interface shape
        const createPatientArgs = toolArguments as {
          firstName: string;
          lastName: string;
          dateOfBirth: string;
          phoneNumber: string;
          email: string;
        };
        handlerResponse = await handleCreatePatientRecord(createPatientArgs, toolCall.id);
        
        // Critical state update: save the patient ID if successful
        if (handlerResponse.result?.nexhealthPatientId) {
          state.patientDetails.nexhealthPatientId = handlerResponse.result.nexhealthPatientId;
          state.patientDetails.status = 'IDENTIFIED' as PatientRecordStatus;
          console.log(`[State Management] Saved patient ID: ${handlerResponse.result.nexhealthPatientId} to state`);
        }
        break;
      }

      default: {
        console.error(`[VAPI Webhook] Unknown tool: ${toolName}`);
        handlerResponse = {
          message: {
            type: "request-failed",
            role: "assistant", 
            content: `I'm sorry, I don't know how to handle the "${toolName}" tool. Please try again.`
          }
        };
        break;
      }
    }

    // State persistence: save the updated state back to the database
    await prisma.callLog.update({
      where: { vapiCallId: callId },
      data: { conversationState: state as unknown as Prisma.InputJsonValue }
    });
    console.log(`[State Management] Persisted state for call: ${callId}, stage: ${state.currentStage}`);

    // Construct and return the final response for VAPI
    const finalResponse = {
      toolCallId: toolCall.id,
      ...handlerResponse
    };

    console.log(`[VAPI Webhook] Final response:`, finalResponse);
    return NextResponse.json({ results: [finalResponse] });

  } catch (error) {
    console.error('Error in VAPI webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 