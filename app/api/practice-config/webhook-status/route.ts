import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId },
      select: {
        id: true,
        name: true,
        webhookLastSyncAt: true,
        webhookLastSuccessfulSyncAt: true,
        webhookSyncErrorMsg: true,
        nexhealthSubdomain: true,
        nexhealthLocationId: true,
        nexhealthWebhookSubscriptions: {
          where: { isActive: true },
          select: {
            resourceType: true,
            eventName: true,
            nexhealthSubscriptionId: true,
            createdAt: true
          }
        }
      }
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Determine sync status based on new fields
    let lastSyncStatus: string;

    if (practice.webhookSyncErrorMsg) {
      lastSyncStatus = "ERROR";
    } else if (practice.webhookLastSuccessfulSyncAt) {
      lastSyncStatus = "SYNCED";
    } else if (practice.webhookLastSyncAt) {
      lastSyncStatus = "SYNC_IN_PROGRESS";
    } else {
      lastSyncStatus = "NEVER_SYNCED";
    }

    // Check if practice has basic configuration
    const hasBasicConfig = !!(practice.nexhealthSubdomain && practice.nexhealthLocationId);

    return NextResponse.json({
      lastSyncAttemptAt: practice.webhookLastSyncAt,
      lastSyncSuccessAt: practice.webhookLastSuccessfulSyncAt,
      lastSyncStatus,
      lastSyncErrorMessage: practice.webhookSyncErrorMsg,
      hasBasicConfig,
      activeSubscriptionsCount: practice.nexhealthWebhookSubscriptions.length,
      subscriptions: practice.nexhealthWebhookSubscriptions.map(sub => ({
        resourceType: sub.resourceType,
        eventName: sub.eventName,
        subscribedAt: sub.createdAt
      })),
      subscriptionCounts: {
        appointment: practice.nexhealthWebhookSubscriptions.filter(s => s.resourceType === 'Appointment').length,
        availability: practice.nexhealthWebhookSubscriptions.filter(s => s.resourceType === 'Availability').length,
        patient: practice.nexhealthWebhookSubscriptions.filter(s => s.resourceType === 'Patient').length,
        provider: practice.nexhealthWebhookSubscriptions.filter(s => s.resourceType === 'Provider').length,
        location: practice.nexhealthWebhookSubscriptions.filter(s => s.resourceType === 'Location').length,
      }
    });

  } catch (error) {
    console.error("Error fetching webhook status:", error);
    return NextResponse.json(
      { error: "Failed to fetch webhook status" },
      { status: 500 }
    );
  }
} 