import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function callNexhealthManagementApi(path: string, options: { method?: string; body?: Record<string, unknown>; params?: Record<string, string> } = {}) {
  const { method = 'GET', body, params } = options;
  
  const NEXHEALTH_API_KEY = process.env.NEXHEALTH_API_KEY;
  if (!NEXHEALTH_API_KEY) {
    throw new Error('NEXHEALTH_API_KEY is required for webhook management');
  }

  const NEXHEALTH_API_BASE_URL = 'https://nexhealth.info';
  let url = `${NEXHEALTH_API_BASE_URL}${path}`;
  
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const requestOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': NEXHEALTH_API_KEY,
      'Accept': 'application/vnd.Nexhealth+json;version=2',
    },
  };

  if (body && method !== 'GET') {
    requestOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, requestOptions);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NexHealth API error (${response.status}): ${errorText}`);
  }

  const responseText = await response.text();
  if (!responseText.trim()) {
    return { data: null };
  }

  const data = JSON.parse(responseText);
  return { data };
}

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId },
    });

    if (!practice || !practice.nexhealthSubdomain) {
      return NextResponse.json({ error: "Practice not found or subdomain not configured" }, { status: 400 });
    }

    // Get global webhook endpoint
    const globalEndpoint = await prisma.globalNexhealthWebhookEndpoint.findUnique({
      where: { id: "singleton" }
    });

    if (!globalEndpoint) {
      return NextResponse.json({ error: "Global webhook endpoint not configured. Contact support." }, { status: 500 });
    }

    // Define events to subscribe to
    const eventsToSubscribe = [
      { resourceType: "Patient", eventName: "patient_created" },
      { resourceType: "Patient", eventName: "patient_updated" },
      { resourceType: "Appointment", eventName: "appointment_created" },
      { resourceType: "Appointment", eventName: "appointment_updated" },
      { resourceType: "SyncStatus", eventName: "sync_status_read_change" },
      { resourceType: "SyncStatus", eventName: "sync_status_write_change" },
    ];

    let successCount = 0;
    let skipCount = 0;
    const errors: string[] = [];

    for (const event of eventsToSubscribe) {
      // Check if already subscribed
      const existing = await prisma.nexhealthWebhookSubscription.findUnique({
        where: {
          practiceId_resourceType_eventName: {
            practiceId: practice.id,
            resourceType: event.resourceType,
            eventName: event.eventName,
          },
        },
      });

      if (existing && existing.isActive) {
        skipCount++;
        continue;
      }

      try {
        const subscriptionResponse = await callNexhealthManagementApi(
          `/webhook_endpoints/${globalEndpoint.nexhealthEndpointId}/webhook_subscriptions`,
          {
            method: 'POST',
            body: { resource_type: event.resourceType, event: event.eventName, active: true },
            params: { subdomain: practice.nexhealthSubdomain }
          }
        );

        const nexhealthSubscriptionId = String(subscriptionResponse.data.data.id);

        await prisma.nexhealthWebhookSubscription.upsert({
          where: {
            practiceId_resourceType_eventName: {
              practiceId: practice.id,
              resourceType: event.resourceType,
              eventName: event.eventName,
            },
          },
          create: {
            practiceId: practice.id,
            nexhealthWebhookEndpointId: globalEndpoint.nexhealthEndpointId,
            nexhealthSubscriptionId: nexhealthSubscriptionId,
            resourceType: event.resourceType,
            eventName: event.eventName,
            isActive: true,
          },
          update: {
            nexhealthSubscriptionId: nexhealthSubscriptionId,
            isActive: true,
            updatedAt: new Date(),
          }
        });

        successCount++;
      } catch (error) {
        console.error(`Failed to subscribe to ${event.resourceType}.${event.eventName}:`, error);
        errors.push(`${event.resourceType}.${event.eventName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      subscriptionsCount: successCount,
      skippedCount: skipCount,
      totalEvents: eventsToSubscribe.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error("Error subscribing to webhooks:", error);
    return NextResponse.json({ 
      error: `Failed to subscribe to webhooks: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, { status: 500 });
  }
} 