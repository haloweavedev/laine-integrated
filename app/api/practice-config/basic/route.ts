import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Function to subscribe practice to webhooks
async function syncWebhooksForPractice(subdomain: string): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`[AutoWebhookSync] Syncing webhooks for ${subdomain}...`);
    
    // Run the webhook subscription script
    const { stdout, stderr } = await execAsync(`pnpm webhook:subscribe ${subdomain}`, {
      timeout: 30000 // 30 second timeout
    });
    
    console.log(`[AutoWebhookSync] Stdout:`, stdout);
    if (stderr) {
      console.error(`[AutoWebhookSync] Stderr:`, stderr);
    }
    
    // Check for success indicators in output
    if (stdout.includes('✅') || stdout.includes('success') || stdout.includes('Successfully')) {
      return { success: true, message: "Webhooks synchronized automatically" };
    } else {
      return { success: false, message: "Webhook sync completed with warnings" };
    }
  } catch (error) {
    console.error(`[AutoWebhookSync] Error:`, error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : "Failed to sync webhooks"
    };
  }
}

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
        webhookLastSyncAt: new Date() // Update sync timestamp
      },
      create: { 
        clerkUserId: userId, 
        name, 
        nexhealthSubdomain: subdomain, 
        nexhealthLocationId: locationId,
        webhookLastSyncAt: new Date() // Set initial sync timestamp
      },
    });

    // Automatically sync webhooks after saving configuration
    let webhookSyncResult = { success: false, message: "Webhook sync not attempted" };
    
    try {
      console.log(`[AutoWebhookSync] Auto-syncing webhooks for practice ${practice.id}...`);
      webhookSyncResult = await syncWebhooksForPractice(subdomain);
      
      if (webhookSyncResult.success) {
        console.log(`[AutoWebhookSync] ✅ Successfully synced webhooks for ${subdomain}`);
      } else {
        console.warn(`[AutoWebhookSync] ⚠️ Webhook sync completed with issues: ${webhookSyncResult.message}`);
      }
    } catch (webhookError) {
      console.error(`[AutoWebhookSync] ❌ Failed to sync webhooks:`, webhookError);
      webhookSyncResult = {
        success: false,
        message: "Configuration saved, but webhook sync failed"
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