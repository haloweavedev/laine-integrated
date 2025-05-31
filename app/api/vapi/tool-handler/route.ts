import { NextRequest, NextResponse } from "next/server";
import { getToolByName } from "@/lib/tools";
import { prisma } from "@/lib/prisma";
import { Practice } from "@prisma/client";
import { z } from "zod";
// import { verifyVapiRequest } from "@/lib/vapi"; // Implement if VAPI provides signing for tool webhooks

// Define the expected payload structures from VAPI for different webhook types
interface VapiBasePayload {
  call: {
    id: string; // VAPI Call ID
    orgId?: string;
    assistantId?: string;
    // ... other call details
  };
}

interface VapiToolCallPayload extends VapiBasePayload {
  type: "tool-calls";
  toolCalls: Array<{
    toolCallId: string;
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arguments: Record<string, any> | string; // VAPI might send stringified JSON
  }>;
}

interface VapiEndOfCallReportPayload extends VapiBasePayload {
  type: "end-of-call-report";
  endOfCallReport: {
    summary?: string;
    transcript?: string;
    recordingUrl?: string;
    // ... other fields
  };
}

interface VapiStatusUpdatePayload extends VapiBasePayload {
  type: "status-update";
  status: string; // e.g., "started", "ended", "forwarding", etc.
  timestamp?: string;
}

interface VapiTranscriptPayload extends VapiBasePayload {
  type: "transcript";
  transcript: {
    text: string;
    role: "user" | "assistant";
    timestamp?: string;
  };
}

type VapiWebhookPayload = VapiToolCallPayload | VapiEndOfCallReportPayload | VapiStatusUpdatePayload | VapiTranscriptPayload;

async function findPracticeByAssistantId(assistantId?: string): Promise<Practice | null> {
  if (!assistantId) return null;
  
  const assistantConfig = await prisma.practiceAssistantConfig.findUnique({
    where: { vapiAssistantId: assistantId },
    include: { practice: true }
  });
  
  return assistantConfig?.practice || null;
}

async function handleToolCalls(payload: VapiToolCallPayload, practice: Practice): Promise<NextResponse> {
  const vapiCallId = payload.call.id;

  // Upsert CallLog entry at the start of tool processing for this call
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
      },
    });
  } catch (dbError) {
    console.error(`VAPI tool-handler: Error upserting CallLog for ${vapiCallId}:`, dbError);
  }

  const results = [];
  for (const toolCall of payload.toolCalls) {
    const tool = getToolByName(toolCall.name);
    if (!tool) {
      console.error(`VAPI tool-handler: Unknown tool requested: ${toolCall.name}`);
      results.push({
        toolCallId: toolCall.toolCallId,
        result: JSON.stringify({ 
          success: false, 
          error_code: "UNKNOWN_TOOL", 
          message_to_patient: `I don't know how to do that.` 
        }),
      });
      continue;
    }

    try {
      // VAPI might send arguments as a stringified JSON or an object.
      const parsedArgs = typeof toolCall.arguments === 'string' 
        ? JSON.parse(toolCall.arguments) 
        : toolCall.arguments;
      
      const validatedArgs = tool.schema.parse(parsedArgs);
      const startTime = Date.now();
      
      console.log(`Executing tool: ${tool.name} for practice ${practice.id} with args:`, JSON.stringify(validatedArgs));
      const toolResult = await tool.run({ args: validatedArgs, practice, vapiCallId });
      const durationMs = Date.now() - startTime;

      console.log(`Tool ${tool.name} executed in ${durationMs}ms. Result:`, JSON.stringify(toolResult));

      results.push({
        toolCallId: toolCall.toolCallId,
        result: JSON.stringify(toolResult),
      });

    } catch (error: unknown) {
      console.error(`VAPI tool-handler: Error executing tool ${tool.name}:`, error);
      let userMessage = "I encountered an unexpected issue while trying to help with that.";
      if (error instanceof z.ZodError) {
        userMessage = "I received some unexpected information for that request. Could you try phrasing it differently?";
        console.error("Zod validation error:", error.errors);
      }
      results.push({
        toolCallId: toolCall.toolCallId,
        result: JSON.stringify({ 
          success: false, 
          error_code: "TOOL_EXECUTION_ERROR", 
          message_to_patient: userMessage, 
          details: error instanceof Error ? error.message : 'Unknown error'
        }),
      });
    }
  }
  
  console.log("VAPI tool-handler: Sending tool call results back to VAPI:", JSON.stringify({ results }));
  return NextResponse.json({ results });
}

async function handleEndOfCallReport(payload: VapiEndOfCallReportPayload, practice: Practice): Promise<NextResponse> {
  const vapiCallId = payload.call.id;
  const { summary, transcript, recordingUrl } = payload.endOfCallReport;

  console.log(`VAPI end-of-call-report: Practice ${practice.id}, Call ${vapiCallId}`);

  try {
    await prisma.callLog.upsert({
      where: { vapiCallId },
      create: {
        vapiCallId,
        practiceId: practice.id,
        callStatus: "ENDED",
        callTimestampStart: new Date(),
        summary: summary || null,
        transcriptText: transcript || null,
        vapiTranscriptUrl: recordingUrl || null,
      },
      update: {
        callStatus: "ENDED",
        summary: summary || undefined,
        transcriptText: transcript || undefined,
        vapiTranscriptUrl: recordingUrl || undefined,
        updatedAt: new Date(),
      },
    });

    console.log(`VAPI end-of-call-report: Updated CallLog for ${vapiCallId}`);
  } catch (dbError) {
    console.error(`VAPI end-of-call-report: Error updating CallLog for ${vapiCallId}:`, dbError);
  }

  return NextResponse.json({ message: "End of call report received" });
}

async function handleStatusUpdate(payload: VapiStatusUpdatePayload, practice: Practice): Promise<NextResponse> {
  const vapiCallId = payload.call.id;
  const { status } = payload;

  console.log(`VAPI status-update: Practice ${practice.id}, Call ${vapiCallId}, Status: ${status}`);

  try {
    // Map VAPI statuses to our CallLog statuses
    let callStatus = status.toUpperCase();
    if (status === "started") callStatus = "INITIATED";
    if (status === "ended") callStatus = "ENDED";
    if (status === "forwarding") callStatus = "FORWARDING";

    await prisma.callLog.upsert({
      where: { vapiCallId },
      create: {
        vapiCallId,
        practiceId: practice.id,
        callStatus,
        callTimestampStart: new Date(),
      },
      update: {
        callStatus,
        updatedAt: new Date(),
      },
    });

    console.log(`VAPI status-update: Updated CallLog status to ${callStatus} for ${vapiCallId}`);
  } catch (dbError) {
    console.error(`VAPI status-update: Error updating CallLog for ${vapiCallId}:`, dbError);
  }

  return NextResponse.json({ message: "Status update received" });
}

async function handleTranscript(payload: VapiTranscriptPayload, practice: Practice): Promise<NextResponse> {
  const vapiCallId = payload.call.id;
  const { text, role } = payload.transcript;

  console.log(`VAPI transcript: Practice ${practice.id}, Call ${vapiCallId}, Role: ${role}, Text: ${text.substring(0, 100)}...`);

  try {
    // For transcript updates, we'll append to existing transcript text
    const existingCallLog = await prisma.callLog.findUnique({
      where: { vapiCallId },
    });

    const newTranscriptText = existingCallLog?.transcriptText 
      ? `${existingCallLog.transcriptText}\n[${role}]: ${text}`
      : `[${role}]: ${text}`;

    await prisma.callLog.upsert({
      where: { vapiCallId },
      create: {
        vapiCallId,
        practiceId: practice.id,
        callStatus: "IN_PROGRESS",
        callTimestampStart: new Date(),
        transcriptText: newTranscriptText,
      },
      update: {
        transcriptText: newTranscriptText,
        updatedAt: new Date(),
      },
    });

    console.log(`VAPI transcript: Updated transcript for ${vapiCallId}`);
  } catch (dbError) {
    console.error(`VAPI transcript: Error updating CallLog for ${vapiCallId}:`, dbError);
  }

  return NextResponse.json({ message: "Transcript received" });
}

export async function POST(req: NextRequest) {
  let payload: VapiWebhookPayload;
  try {
    payload = await req.json();
    console.log(`VAPI webhook received: ${payload.type}`, JSON.stringify(payload, null, 2));
  } catch (e) {
    console.error("Failed to parse VAPI webhook request body:", e);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // TODO: Implement request verification if VAPI provides a signing secret
  // const { verified, error } = await verifyVapiRequest(req, process.env.VAPI_WEBHOOK_SIGNING_SECRET);
  // if (!verified) {
  //   console.error("VAPI webhook request verification failed:", error);
  //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // }

  // Identify the practice by assistant ID
  const practice = await findPracticeByAssistantId(payload.call.assistantId);
  
  if (!practice) {
    console.error(`VAPI webhook: Could not find practice for assistantId ${payload.call.assistantId}`);
    if (payload.type === "tool-calls") {
      // For tool calls, we need to return error results
      const errorResults = (payload as VapiToolCallPayload).toolCalls.map(tc => ({
        toolCallId: tc.toolCallId,
        result: JSON.stringify({ 
          success: false, 
          error_code: "PRACTICE_NOT_FOUND", 
          message_to_patient: "I'm having trouble identifying the practice settings." 
        })
      }));
      return NextResponse.json({ results: errorResults });
    } else {
      // For other webhook types, just return success to avoid retries
      return NextResponse.json({ message: "Received, but practice not found" });
    }
  }

  // Route to appropriate handler based on webhook type
  switch (payload.type) {
    case "tool-calls":
      return handleToolCalls(payload as VapiToolCallPayload, practice);
    
    case "end-of-call-report":
      return handleEndOfCallReport(payload as VapiEndOfCallReportPayload, practice);
    
    case "status-update":
      return handleStatusUpdate(payload as VapiStatusUpdatePayload, practice);
    
    case "transcript":
      return handleTranscript(payload as VapiTranscriptPayload, practice);
    
    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.warn(`VAPI webhook: Unknown webhook type: ${(payload as any).type}`);
      return NextResponse.json({ message: "Unknown webhook type" }, { status: 400 });
  }
} 