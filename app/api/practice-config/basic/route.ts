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
    const practiceSlug = formData.get("practiceSlug") as string | null;
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

    // Validate and normalize slug if provided
    let validatedSlug: string | null = null;
    if (practiceSlug && practiceSlug.trim()) {
      const slugValue = practiceSlug.trim().toLowerCase();
      
      // Check if slug is URL-friendly format (lowercase, no spaces, no special characters except hyphens)
      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(slugValue)) {
        return NextResponse.json(
          { error: "Practice slug must contain only lowercase letters, numbers, and hyphens" },
          { status: 400 }
        );
      }

      // Check for uniqueness
      const existingPracticeWithSlug = await prisma.practice.findFirst({
        where: {
          slug: slugValue,
          clerkUserId: { not: userId } // Exclude current practice
        }
      });

      if (existingPracticeWithSlug) {
        return NextResponse.json(
          { error: "This practice slug is already in use. Please choose a different one." },
          { status: 409 }
        );
      }

      validatedSlug = slugValue;
    }

    // Update webhook last sync timestamp to reflect sync attempt time
    const syncAttemptTime = new Date();

    // Save the practice configuration
    const practice = await prisma.practice.upsert({
      where: { clerkUserId: userId },
      update: { 
        name, 
        slug: validatedSlug,
        nexhealthSubdomain: subdomain, 
        nexhealthLocationId: locationId,
        address,
        acceptedInsurances,
        serviceCostEstimates,
        webhookLastSyncAt: syncAttemptTime // Update sync timestamp when attempt is made
      },
      create: { 
        clerkUserId: userId, 
        name, 
        slug: validatedSlug,
        nexhealthSubdomain: subdomain, 
        nexhealthLocationId: locationId,
        address,
        acceptedInsurances,
        serviceCostEstimates,
        webhookLastSyncAt: syncAttemptTime // Set initial sync timestamp
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
        
        // Update practice with successful sync
        await prisma.practice.update({
          where: { id: practice.id },
          data: {
            webhookLastSuccessfulSyncAt: new Date(),
            webhookSyncErrorMsg: null
          }
        });
      } else {
        console.warn(`[AutoWebhookSync] ⚠️ Webhook sync completed with issues: ${webhookSyncResult.message}`);
        
        // Update practice with error message
        await prisma.practice.update({
          where: { id: practice.id },
          data: {
            webhookSyncErrorMsg: webhookSyncResult.message
          }
        });
      }
    } catch (webhookError) {
      console.error(`[AutoWebhookSync] ❌ Failed to sync webhooks:`, webhookError);
      const errorMessage = webhookError instanceof Error ? webhookError.message : "Configuration saved, but webhook sync failed";
      
      // Update practice with error message
      await prisma.practice.update({
        where: { id: practice.id },
        data: {
          webhookSyncErrorMsg: errorMessage
        }
      });
      
      webhookSyncResult = {
        success: false,
        message: errorMessage,
        successCount: 0,
        skipCount: 0,
        failCount: 0
      };
    }

    // Return minimal response suitable for non-reloading save
    return NextResponse.json({ 
      success: true,
      practice: {
        id: practice.id,
        name: practice.name,
        nexhealthSubdomain: practice.nexhealthSubdomain,
        nexhealthLocationId: practice.nexhealthLocationId,
        webhookLastSyncAt: practice.webhookLastSyncAt
      },
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