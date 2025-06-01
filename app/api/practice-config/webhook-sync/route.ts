import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { subscribePracticeToWebhooks } from "@/lib/webhook-utils";

export async function POST(req: NextRequest) {
  console.log("=== Webhook Sync API ===");
  
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subdomain } = await req.json();
    
    if (!subdomain) {
      return NextResponse.json({ error: "Subdomain is required" }, { status: 400 });
    }

    // Verify the practice belongs to this user
    const practice = await prisma.practice.findFirst({
      where: {
        clerkUserId: userId,
        nexhealthSubdomain: subdomain
      }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    console.log(`[WebhookSync] Syncing webhooks for practice: ${practice.id} (${subdomain})`);

    // Subscribe to webhooks using the new utility
    const result = await subscribePracticeToWebhooks(subdomain);

    // Update the webhook sync timestamp in the database
    await prisma.practice.update({
      where: { id: practice.id },
      data: {
        webhookLastSyncAt: new Date()
      }
    });

    // Fetch updated webhook subscriptions
    const updatedPractice = await prisma.practice.findUnique({
      where: { id: practice.id },
      include: {
        nexhealthWebhookSubscriptions: true
      }
    });

    return NextResponse.json({
      success: result.success,
      message: result.message,
      details: {
        successCount: result.successCount,
        skipCount: result.skipCount,
        failCount: result.failCount
      },
      webhookSubscriptions: updatedPractice?.nexhealthWebhookSubscriptions || [],
      lastSyncTime: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error in webhook sync API:", error);
    return NextResponse.json({
      success: false,
      message: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 