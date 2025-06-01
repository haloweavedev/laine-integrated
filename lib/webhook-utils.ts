import { prisma } from "@/lib/prisma";

const NEXHEALTH_API_BASE_URL = process.env.NEXHEALTH_API_BASE_URL || 'https://nexhealth.info';
const MASTER_NEXHEALTH_API_KEY = process.env.NEXHEALTH_API_KEY;

// Helper function for NexHealth Management API calls
async function callNexhealthManagementApi(path: string, options: {
  method?: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
} = {}) {
  const { method = 'GET', body, params } = options;
  
  if (!MASTER_NEXHEALTH_API_KEY) {
    throw new Error('NEXHEALTH_API_KEY (master key) is required for webhook management');
  }

  let url = `${NEXHEALTH_API_BASE_URL}${path}`;
  
  // Add query parameters if provided
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const requestOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': MASTER_NEXHEALTH_API_KEY, // Raw API key, no Bearer prefix
      'Accept': 'application/vnd.Nexhealth+json;version=2', // Required API version header
    },
  };

  if (body && method !== 'GET') {
    requestOptions.body = JSON.stringify(body);
  }

  console.log(`🔗 NexHealth API: ${method} ${url}`);
  if (body) {
    console.log('📤 Request body:', JSON.stringify(body, null, 2));
  }

  try {
    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ NexHealth API error (${response.status}):`, errorText);
      const error = new Error(`NexHealth API error (${response.status}): ${errorText}`);
      throw error;
    }

    // Handle empty responses (like DELETE operations)
    const responseText = await response.text();
    if (!responseText.trim()) {
      console.log('📥 Response: (empty - operation successful)');
      return { data: null };
    }

    const data = JSON.parse(responseText);
    console.log('📥 Response:', JSON.stringify(data, null, 2));
    return { data };
  } catch (error) {
    console.error('❌ Network error calling NexHealth API:', error);
    throw error;
  }
}

// Subscribe practice to webhook events (imported logic from scripts/manage-nexhealth-webhooks.js)
export async function subscribePracticeToWebhooks(practiceSubdomain: string): Promise<{
  success: boolean;
  message: string;
  successCount: number;
  skipCount: number;
  failCount: number;
}> {
  console.log(`🔗 [WebhookUtils] Subscribing practice "${practiceSubdomain}" to NexHealth events...`);

  try {
    // 1. Get global webhook endpoint ID from our DB
    const globalEndpoint = await prisma.globalNexhealthWebhookEndpoint.findUnique({ 
      where: { id: "singleton" } 
    });
    
    if (!globalEndpoint || !globalEndpoint.nexhealthEndpointId) {
      throw new Error('Global webhook endpoint not configured in DB. Contact support.');
    }
    
    const globalNexhealthEndpointId = globalEndpoint.nexhealthEndpointId;

    // 2. Find the practice in our DB by subdomain to get its ID
    const practice = await prisma.practice.findFirst({ 
      where: { nexhealthSubdomain: practiceSubdomain } 
    });
    
    if (!practice) {
      throw new Error(`Practice with subdomain "${practiceSubdomain}" not found in database`);
    }

    // 3. Define events to subscribe to
    const eventsToSubscribe = [
      // Patient events
      { resourceType: "Patient", eventName: "patient_created" },
      { resourceType: "Patient", eventName: "patient_updated" },
      
      // Appointment events  
      { resourceType: "Appointment", eventName: "appointment_created" },
      { resourceType: "Appointment", eventName: "appointment_updated" },
      
      // Sync status events (for system monitoring)
      { resourceType: "SyncStatus", eventName: "sync_status_read_change" },
      { resourceType: "SyncStatus", eventName: "sync_status_write_change" },
    ];

    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    for (const event of eventsToSubscribe) {
      // Check if already subscribed in our DB
      const existingDbSub = await prisma.nexhealthWebhookSubscription.findUnique({
        where: {
          practiceId_resourceType_eventName: {
            practiceId: practice.id,
            resourceType: event.resourceType,
            eventName: event.eventName,
          },
        },
      });

      if (existingDbSub && existingDbSub.isActive) {
        console.log(`   👍 Already subscribed to ${event.resourceType}.${event.eventName}`);
        skipCount++;
        continue;
      }

      console.log(`   Subscribing to ${event.resourceType}.${event.eventName}...`);
      
      try {
        const subscriptionResponse = await callNexhealthManagementApi(
          `/webhook_endpoints/${globalNexhealthEndpointId}/webhook_subscriptions`,
          {
            method: 'POST',
            body: { resource_type: event.resourceType, event: event.eventName, active: true },
            params: { subdomain: practice.nexhealthSubdomain || '' }
          }
        );

        const nexhealthSubscriptionId = String(subscriptionResponse.data.data.id);

        // Store subscription in our DB
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
            nexhealthWebhookEndpointId: globalNexhealthEndpointId,
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
        
        console.log(`   ✅ Successfully subscribed to ${event.resourceType}.${event.eventName}`);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Failed to subscribe to ${event.resourceType}.${event.eventName}:`, error);
        failCount++;
      }
    }
    
    const total = eventsToSubscribe.length;
    console.log(`🎉 Practice "${practiceSubdomain}" webhook processing complete:`);
    console.log(`   ✅ Success: ${successCount}, 👍 Skipped: ${skipCount}, ❌ Failed: ${failCount}`);
    
    return {
      success: failCount === 0,
      message: `Processed ${total} events: ${successCount} successful, ${skipCount} already subscribed, ${failCount} failed`,
      successCount,
      skipCount,
      failCount
    };

  } catch (error) {
    console.error(`❌ [WebhookUtils] Error subscribing practice "${practiceSubdomain}":`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error during webhook subscription",
      successCount: 0,
      skipCount: 0,
      failCount: 0
    };
  }
} 