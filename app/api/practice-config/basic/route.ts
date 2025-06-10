import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subscribePracticeToWebhooks } from "@/lib/webhook-utils";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const name = formData.get("practiceName") as string | null;
    const subdomain = formData.get("nexhealthSubdomain") as string;
    const locationId = formData.get("nexhealthLocationId") as string;
    const address = formData.get("practiceAddress") as string | null;
    const acceptedInsurances = formData.get("acceptedInsurances") as string | null;
    const serviceCostEstimates = formData.get("serviceCostEstimates") as string | null;

    if (!subdomain || !locationId) {
      return NextResponse.json(
        { error: "Subdomain and Location ID are required" },
        { status: 400 }
      );
    }

    // Save the practice configuration
    const practice = await prisma.practice.upsert({
      where: { clerkUserId: userId },
      update: { 
        name, 
        nexhealthSubdomain: subdomain, 
        nexhealthLocationId: locationId,
        address,
        acceptedInsurances,
        serviceCostEstimates,
        webhookLastSyncAt: new Date() // Update sync timestamp
      },
      create: { 
        clerkUserId: userId, 
        name, 
        nexhealthSubdomain: subdomain, 
        nexhealthLocationId: locationId,
        address,
        acceptedInsurances,
        serviceCostEstimates,
        webhookLastSyncAt: new Date() // Set initial sync timestamp
      },
    });

    // Automatically sync webhooks after saving configuration
    let webhookSyncResult = { 
      success: false, 
      message: "Webhook sync not attempted",
      successCount: 0,
      skipCount: 0,
      failCount: 0
    };
    
    try {
      console.log(`[AutoWebhookSync] Auto-syncing webhooks for practice ${practice.id}...`);
      webhookSyncResult = await subscribePracticeToWebhooks(subdomain);
      
      if (webhookSyncResult.success) {
        console.log(`[AutoWebhookSync] ✅ Successfully synced webhooks for ${subdomain}`);
      } else {
        console.warn(`[AutoWebhookSync] ⚠️ Webhook sync completed with issues: ${webhookSyncResult.message}`);
      }
    } catch (webhookError) {
      console.error(`[AutoWebhookSync] ❌ Failed to sync webhooks:`, webhookError);
      webhookSyncResult = {
        success: false,
        message: "Configuration saved, but webhook sync failed",
        successCount: 0,
        skipCount: 0,
        failCount: 0
      };
    }

    return NextResponse.json({ 
      success: true,
      webhookSync: webhookSyncResult
    });

  } catch (error) {
    console.error("Error saving practice config:", error);
    return NextResponse.json(
      { error: "Failed to save configuration" },
      { status: 500 }
    );
  }
} 