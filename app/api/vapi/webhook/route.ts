import { NextRequest, NextResponse } from "next/server";
import { verifyVapiRequest } from "@/lib/vapi";
import { prisma } from "@/lib/prisma";
import type { VapiWebhookPayload, VapiStatusUpdateMessage, VapiEndOfCallReportMessage, VapiTranscriptMessage } from "@/types/vapi";

export async function POST(request: NextRequest) {
  console.log("=== VAPI General Webhook Handler ===");
  
  try {
    // Verify the webhook (when VAPI supports request signing)
    const verification = await verifyVapiRequest();
    if (!verification.verified) {
      console.error("VAPI webhook verification failed:", verification.error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse the JSON body and type it properly
    const body: VapiWebhookPayload = await request.json();
    
    // Correctly extract the message type from body.message.type
    const messageType = body.message?.type;

    console.log("=== VAPI General Webhook Handler ===");
    console.log("[VAPI] Request verification - not yet implemented"); 
    console.log("VAPI webhook message type:", messageType);
    console.log("VAPI webhook payload:", JSON.stringify(body, null, 2));

    if (!messageType) {
      console.error("[VAPI Webhook] Message type is missing or undefined in payload.");
      return NextResponse.json({ error: "Malformed VAPI webhook payload: message.type missing." }, { status: 400 });
    }

    // Handle different webhook types based on message.type
    switch (messageType) {
      case "status-update":
        await handleStatusUpdate(body.message as VapiStatusUpdateMessage);
        break;
      
      case "end-of-call-report":
        await handleEndOfCallReport(body.message as VapiEndOfCallReportMessage);
        break;
      
      case "transcript":
        await handleTranscript(body.message as VapiTranscriptMessage);
        break;
      
      default:
        console.log(`[VAPI Webhook] Received unhandled message type: ${messageType}`);
    }

    return NextResponse.json({ success: true, message: `Webhook type ${messageType} received.` }, { status: 200 });
  } catch (error) {
    console.error("[VAPI Webhook] Error processing webhook:", error);
    return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
  }
}

async function handleStatusUpdate(message: VapiStatusUpdateMessage) {
  console.log(`[VAPI Webhook] Received status-update. Status: ${message.call?.status}, Ended Reason: ${message.call?.endedReason}`);
  
  try {
    if (!message.call) {
      console.error("No call data in status update payload");
      return;
    }

    // Find practice by assistant ID
    const practice = await findPracticeByAssistantId(message.call.assistantId);
    if (!practice) {
      console.error("Practice not found for assistant:", message.call.assistantId);
      return;
    }

    // Update or create call log
    await prisma.callLog.upsert({
      where: { vapiCallId: message.call.id },
      create: {
        vapiCallId: message.call.id,
        practiceId: practice.id,
        assistantId: message.call.assistantId,
        callTimestampStart: message.call.startedAt ? new Date(message.call.startedAt) : null,
        callStatus: message.call.status,
      },
      update: {
        callStatus: message.call.status,
        assistantId: message.call.assistantId,
        updatedAt: new Date()
      }
    });

    console.log(`[VAPI Webhook] Updated call status for ${message.call.id}: ${message.call.status}`);
    
    // TODO: Enhanced status handling - if (message.call.status === 'ended' && message.call.endedReason) {
    //   await prisma.callLog.updateMany({ 
    //     where: { vapiCallId: message.call.id }, 
    //     data: { 
    //       callStatus: 'ENDED', 
    //       endedReason: message.call.endedReason, 
    //       updatedAt: new Date() 
    //     }
    //   });
    // }
  } catch (error) {
    console.error("[VAPI Webhook] Error handling status update:", error);
  }
}

async function handleEndOfCallReport(message: VapiEndOfCallReportMessage) {
  console.log(`[VAPI Webhook] Received end-of-call-report. Call ID: ${message.call?.id}`);
  
  try {
    if (!message.call) {
      console.error("[VAPI Webhook] No call data in end-of-call-report payload");
      return;
    }

    // Find practice by assistant ID
    const practice = await findPracticeByAssistantId(message.call.assistantId);
    if (!practice) {
      console.error("[VAPI Webhook] Practice not found for assistant:", message.call.assistantId);
      return;
    }

    // Update call log with final details
    await prisma.callLog.upsert({
      where: { vapiCallId: message.call.id },
      create: {
        vapiCallId: message.call.id,
        practiceId: practice.id,
        assistantId: message.call.assistantId,
        callTimestampStart: message.call.startedAt ? new Date(message.call.startedAt) : null,
        callStatus: "ENDED",
        endedReason: message.call.endedReason,
        callDurationSeconds: message.call.startedAt && message.call.endedAt 
          ? Math.round((new Date(message.call.endedAt).getTime() - new Date(message.call.startedAt).getTime()) / 1000)
          : null,
        cost: message.call.cost ? parseFloat(message.call.cost) : null,
        summary: message.summary,
        vapiTranscriptUrl: message.transcript?.url,
      },
      update: {
        callStatus: "ENDED",
        endedReason: message.call.endedReason,
        callDurationSeconds: message.call.startedAt && message.call.endedAt 
          ? Math.round((new Date(message.call.endedAt).getTime() - new Date(message.call.startedAt).getTime()) / 1000)
          : null,
        cost: message.call.cost ? parseFloat(message.call.cost) : null,
        summary: message.summary,
        vapiTranscriptUrl: message.transcript?.url,
        updatedAt: new Date()
      }
    });

    console.log(`[VAPI Webhook] Updated end of call report for ${message.call.id}`);
    
    // TODO: Additional end-of-call processing - if (message.call.id && message.summary) {
    //   await prisma.callLog.updateMany({ 
    //     where: { vapiCallId: message.call.id }, 
    //     data: { 
    //       summary: message.summary, 
    //       cost: message.call.cost ? parseFloat(message.call.cost) : null,
    //       callDurationSeconds: message.call.startedAt && message.call.endedAt 
    //         ? Math.round((new Date(message.call.endedAt).getTime() - new Date(message.call.startedAt).getTime()) / 1000)
    //         : null,
    //       updatedAt: new Date() 
    //     }
    //   });
    // }
  } catch (error) {
    console.error("[VAPI Webhook] Error handling end of call report:", error);
  }
}

async function handleTranscript(message: VapiTranscriptMessage) {
  console.log(`[VAPI Webhook] Received transcript update. Call ID: ${message.call?.id}`);
  
  try {
    if (!message.call) {
      console.error("[VAPI Webhook] No call data in transcript payload");
      return;
    }

    // Find practice by assistant ID
    const practice = await findPracticeByAssistantId(message.call.assistantId);
    if (!practice) {
      console.error("[VAPI Webhook] Practice not found for assistant:", message.call.assistantId);
      return;
    }

    // Update call log with transcript
    await prisma.callLog.upsert({
      where: { vapiCallId: message.call.id },
      create: {
        vapiCallId: message.call.id,
        practiceId: practice.id,
        assistantId: message.call.assistantId,
        callTimestampStart: message.call.startedAt ? new Date(message.call.startedAt) : null,
        callStatus: message.call.status || "IN_PROGRESS",
        transcriptText: message.transcript?.text,
      },
      update: {
        transcriptText: message.transcript?.text,
        updatedAt: new Date()
      }
    });

    console.log(`[VAPI Webhook] Updated transcript for ${message.call.id}`);
    
    // TODO: Enhanced transcript handling - if (message.call.id && message.transcript?.text) {
    //   await prisma.callLog.updateMany({ 
    //     where: { vapiCallId: message.call.id }, 
    //     data: { 
    //       transcriptText: message.transcript.text, 
    //       updatedAt: new Date() 
    //     }
    //   });
    // }
  } catch (error) {
    console.error("[VAPI Webhook] Error handling transcript:", error);
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