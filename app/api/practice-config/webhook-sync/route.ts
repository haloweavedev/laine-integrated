import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Function to subscribe practice to webhooks using the existing script
async function subscribeToWebhooks(subdomain: string): Promise<{ success: boolean; message: string; subscriptions?: unknown[] }> {
  try {
    console.log(`[WebhookSync] Subscribing practice ${subdomain} to webhooks...`);
    
    // Run the existing webhook subscription script
    const { stdout, stderr } = await execAsync(`pnpm webhook:subscribe ${subdomain}`);
    
    console.log(`[WebhookSync] Stdout:`, stdout);
    if (stderr) {
      console.error(`[WebhookSync] Stderr:`, stderr);
    }
    
    // Parse the output to check for success
    if (stdout.includes('✅') || stdout.includes('success')) {
      return {
        success: true,
        message: "Webhooks synchronized successfully"
      };
    } else {
      return {
        success: false,
        message: stderr || "Unknown error during webhook subscription"
      };
    }
  } catch (error) {
    console.error(`[WebhookSync] Error subscribing to webhooks:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to sync webhooks"
    };
  }
}

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

    // Subscribe to webhooks
    const result = await subscribeToWebhooks(subdomain);

    // Update the webhook sync timestamp in the database
    await prisma.practice.update({
      where: { id: practice.id },
      data: {
        updatedAt: new Date() // This will serve as our "last webhook sync" timestamp
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