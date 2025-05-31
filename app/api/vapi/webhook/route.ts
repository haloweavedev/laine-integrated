import { NextRequest, NextResponse } from "next/server";
import { verifyVapiRequest } from "@/lib/vapi";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  console.log("=== VAPI General Webhook Handler ===");
  
  try {
    // Verify the webhook (when VAPI supports request signing)
    const verification = await verifyVapiRequest();
    if (!verification.verified) {
      console.error("VAPI webhook verification failed:", verification.error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    console.log("VAPI webhook payload type:", payload.type);
    console.log("VAPI webhook payload:", JSON.stringify(payload, null, 2));

    // Handle different webhook types
    switch (payload.type) {
      case "status-update":
        await handleStatusUpdate(payload);
        break;
      
      case "end-of-call-report":
        await handleEndOfCallReport(payload);
        break;
      
      case "transcript":
        await handleTranscript(payload);
        break;
      
      default:
        console.log(`Unhandled VAPI webhook type: ${payload.type}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing VAPI webhook:", error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}

async function handleStatusUpdate(payload: { call?: { id: string; assistantId: string; status: string; startedAt?: string } }) {
  console.log("Handling status update:", payload.call?.status);
  
  try {
    if (!payload.call) {
      console.error("No call data in status update payload");
      return;
    }

    // Find practice by assistant ID
    const practice = await findPracticeByAssistantId(payload.call.assistantId);
    if (!practice) {
      console.error("Practice not found for assistant:", payload.call.assistantId);
      return;
    }

    // Update or create call log
    await prisma.callLog.upsert({
      where: { vapiCallId: payload.call.id },
      create: {
        vapiCallId: payload.call.id,
        practiceId: practice.id,
        assistantId: payload.call.assistantId,
        callTimestampStart: payload.call.startedAt ? new Date(payload.call.startedAt) : null,
        callStatus: payload.call.status,
      },
      update: {
        callStatus: payload.call.status,
        assistantId: payload.call.assistantId,
        updatedAt: new Date()
      }
    });

    console.log(`Updated call status for ${payload.call.id}: ${payload.call.status}`);
  } catch (error) {
    console.error("Error handling status update:", error);
  }
}

async function handleEndOfCallReport(payload: { 
  call?: { 
    id: string; 
    assistantId: string; 
    startedAt?: string; 
    endedAt?: string; 
    endedReason?: string; 
    cost?: string 
  }; 
  summary?: string; 
  transcript?: { url?: string } 
}) {
  console.log("Handling end of call report");
  
  try {
    if (!payload.call) {
      console.error("No call data in end-of-call-report payload");
      return;
    }

    // Find practice by assistant ID
    const practice = await findPracticeByAssistantId(payload.call.assistantId);
    if (!practice) {
      console.error("Practice not found for assistant:", payload.call.assistantId);
      return;
    }

    // Update call log with final details
    await prisma.callLog.upsert({
      where: { vapiCallId: payload.call.id },
      create: {
        vapiCallId: payload.call.id,
        practiceId: practice.id,
        assistantId: payload.call.assistantId,
        callTimestampStart: payload.call.startedAt ? new Date(payload.call.startedAt) : null,
        callStatus: "ENDED",
        endedReason: payload.call.endedReason,
        callDurationSeconds: payload.call.startedAt && payload.call.endedAt 
          ? Math.round((new Date(payload.call.endedAt).getTime() - new Date(payload.call.startedAt).getTime()) / 1000)
          : null,
        cost: payload.call.cost ? parseFloat(payload.call.cost) : null,
        summary: payload.summary,
        vapiTranscriptUrl: payload.transcript?.url,
      },
      update: {
        callStatus: "ENDED",
        endedReason: payload.call.endedReason,
        callDurationSeconds: payload.call.startedAt && payload.call.endedAt 
          ? Math.round((new Date(payload.call.endedAt).getTime() - new Date(payload.call.startedAt).getTime()) / 1000)
          : null,
        cost: payload.call.cost ? parseFloat(payload.call.cost) : null,
        summary: payload.summary,
        vapiTranscriptUrl: payload.transcript?.url,
        updatedAt: new Date()
      }
    });

    console.log(`Updated end of call report for ${payload.call.id}`);
  } catch (error) {
    console.error("Error handling end of call report:", error);
  }
}

async function handleTranscript(payload: { 
  call?: { 
    id: string; 
    assistantId: string; 
    startedAt?: string; 
    status?: string 
  }; 
  transcript?: { text?: string } 
}) {
  console.log("Handling transcript update");
  
  try {
    if (!payload.call) {
      console.error("No call data in transcript payload");
      return;
    }

    // Find practice by assistant ID
    const practice = await findPracticeByAssistantId(payload.call.assistantId);
    if (!practice) {
      console.error("Practice not found for assistant:", payload.call.assistantId);
      return;
    }

    // Update call log with transcript
    await prisma.callLog.upsert({
      where: { vapiCallId: payload.call.id },
      create: {
        vapiCallId: payload.call.id,
        practiceId: practice.id,
        assistantId: payload.call.assistantId,
        callTimestampStart: payload.call.startedAt ? new Date(payload.call.startedAt) : null,
        callStatus: payload.call.status || "IN_PROGRESS",
        transcriptText: payload.transcript?.text,
      },
      update: {
        transcriptText: payload.transcript?.text,
        updatedAt: new Date()
      }
    });

    console.log(`Updated transcript for ${payload.call.id}`);
  } catch (error) {
    console.error("Error handling transcript:", error);
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