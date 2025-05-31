#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') }); // Ensure .env from project root is loaded
const { PrismaClient } = require('@prisma/client'); // Use require for .js script

const prisma = new PrismaClient();

const NEXHEALTH_API_BASE_URL = process.env.NEXHEALTH_API_BASE_URL || 'https://nexhealth.info';
const MASTER_NEXHEALTH_API_KEY = process.env.NEXHEALTH_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'; // Default for local dev

// --- Helper function for NexHealth Management API calls ---
async function callNexhealthManagementApi(path, options = {}) {
  const { method = 'GET', body, params } = options;
  
  if (!MASTER_NEXHEALTH_API_KEY) {
    throw new Error('NEXHEALTH_API_KEY (master key) is required for webhook management');
  }

  // Debug: Log what we're using for authentication
  console.log(`🔧 Debug: Using API key: ${MASTER_NEXHEALTH_API_KEY ? `${MASTER_NEXHEALTH_API_KEY.substring(0, 10)}...` : 'NOT SET'}`);
  console.log(`🔧 Debug: Base URL: ${NEXHEALTH_API_BASE_URL}`);

  let url = `${NEXHEALTH_API_BASE_URL}${path}`;
  
  // Add query parameters if provided
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const requestOptions = {
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
      error.response = { data: errorText, status: response.status };
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
    console.error('❌ Network error calling NexHealth API:', error.message);
    throw error;
  }
}

// --- Command: setup-global-endpoint ---
async function setupGlobalEndpoint() {
  console.log('🚀 Setting up Global NexHealth Webhook Endpoint...');
  const targetUrl = `${APP_URL}/api/nexhealth-webhook`;

  try {
    // 1. Check DB for existing configuration
    let dbConfig = await prisma.globalNexhealthWebhookEndpoint.findUnique({ where: { id: "singleton" } });

    if (dbConfig) {
      // Verify if the target_url in DB matches current APP_URL
      if (dbConfig.targetUrl === targetUrl) {
        console.log(`✅ Global webhook endpoint already configured in DB: ID ${dbConfig.nexhealthEndpointId}, Target: ${dbConfig.targetUrl}`);
        console.log(`   Secret Key is stored and used by the application.`);
        return;
      } else {
        console.warn(`⚠️  Target URL mismatch. DB has: ${dbConfig.targetUrl}, Current APP_URL: ${targetUrl}`);
        console.log('   Updating to current APP_URL...');
        
        // Delete old endpoint on NexHealth if it exists
        try {
          await callNexhealthManagementApi(`/webhook_endpoints/${dbConfig.nexhealthEndpointId}`, { method: 'DELETE' });
          console.log(`   Deleted old endpoint ${dbConfig.nexhealthEndpointId} from NexHealth`);
        } catch (error) {
          console.warn(`   Could not delete old endpoint (may already be gone): ${error.message}`);
        }
        
        // Remove from DB to create fresh
        await prisma.globalNexhealthWebhookEndpoint.delete({ where: { id: "singleton" } });
        dbConfig = null;
      }
    }

    // 2. If not in DB, check NexHealth for an endpoint with our target_url
    console.log(`Checking NexHealth for existing endpoints with target: ${targetUrl}`);
    const existingEndpoints = await callNexhealthManagementApi('/webhook_endpoints');
    const foundOnNexhealth = existingEndpoints.data?.data?.find(ep => ep.target_url === targetUrl);

    if (foundOnNexhealth) {
      // Exists on NexHealth but not in our DB. We don't have its secret.
      // Safest is to delete it and create a new one so we capture the secret.
      console.warn(`⚠️  Found existing endpoint ${foundOnNexhealth.id} on NexHealth for ${targetUrl} but not in our DB. Deleting it to create a fresh one with a known secret.`);
      await callNexhealthManagementApi(`/webhook_endpoints/${foundOnNexhealth.id}`, { method: 'DELETE' });
    }

    // 3. Create new endpoint on NexHealth
    console.log(`Creating new webhook endpoint on NexHealth for target: ${targetUrl}`);
    const creationResponse = await callNexhealthManagementApi(
      '/webhook_endpoints',
      {
        method: 'POST',
        body: { target_url: targetUrl, active: true },
      }
    );

    const { id: nexhealthEndpointId, secret_key: secretKey } = creationResponse.data.data;

    // 4. Store in our DB
    dbConfig = await prisma.globalNexhealthWebhookEndpoint.create({
      data: {
        id: "singleton",
        nexhealthEndpointId: String(nexhealthEndpointId),
        secretKey: secretKey,
        targetUrl: targetUrl,
        isEnabled: true,
      },
    });

    console.log('✅ Successfully created and stored Global Webhook Endpoint:');
    console.log(`   NexHealth Endpoint ID: ${dbConfig.nexhealthEndpointId}`);
    console.log(`   Target URL: ${dbConfig.targetUrl}`);
    console.log(`   Secret Key: ${dbConfig.secretKey} (Store this securely if needed elsewhere, but app reads from DB)`);
    console.log('   This secret will be used by your /api/nexhealth-webhook route to verify incoming requests.');

  } catch (error) {
    console.error('❌ Error during global webhook endpoint setup:', error.message);
    if (error.response?.data) console.error("NexHealth Error:", error.response.data);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// --- Command: subscribe-practice <practice_subdomain> ---
async function subscribePractice(practiceSubdomain) {
  if (!practiceSubdomain) {
    console.error('❌ Practice subdomain argument is required.');
    console.log('Usage: node scripts/manage-nexhealth-webhooks.js subscribe-practice <practice_subdomain>');
    process.exit(1);
  }
  console.log(`🔗 Subscribing practice "${practiceSubdomain}" to NexHealth events...`);

  try {
    // 1. Get global webhook endpoint ID from our DB
    const globalEndpoint = await prisma.globalNexhealthWebhookEndpoint.findUnique({ where: { id: "singleton" } });
    if (!globalEndpoint || !globalEndpoint.nexhealthEndpointId) {
      console.error('❌ Global webhook endpoint not configured in DB. Run "setup-global-endpoint" first.');
      process.exit(1);
    }
    const globalNexhealthEndpointId = globalEndpoint.nexhealthEndpointId;

    // 2. Find the practice in our DB by subdomain to get its ID
    const practice = await prisma.practice.findFirst({ where: { nexhealthSubdomain: practiceSubdomain } });
    if (!practice) {
      console.error(`❌ Practice with subdomain "${practiceSubdomain}" not found in your database.`);
      console.log('   Make sure the practice has been configured in your application first.');
      process.exit(1);
    }

    // 3. Define events to subscribe to
    const eventsToSubscribe = [
      // Patient events
      { resourceType: "Patient", eventName: "patient_created" },
      { resourceType: "Patient", eventName: "patient_updated" },
      
      // Appointment events
      { resourceType: "Appointment", eventName: "appointment_created" },
      { resourceType: "Appointment", eventName: "appointment_updated" },
      { resourceType: "Appointment", eventName: "appointment_insertion.complete" },
      { resourceType: "Appointment", eventName: "appointment_insertion.failed" },
      
      // Sync status events (for system monitoring)
      { resourceType: "SyncStatus", eventName: "sync_status_read_change" },
      { resourceType: "SyncStatus", eventName: "sync_status_write_change" },
    ];

    let successCount = 0;
    let skipCount = 0;

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
        console.log(`   👍 Practice "${practiceSubdomain}" already subscribed to ${event.resourceType}.${event.eventName} (ID: ${existingDbSub.nexhealthSubscriptionId}).`);
        skipCount++;
        continue;
      }

      console.log(`   Attempting to subscribe "${practiceSubdomain}" to ${event.resourceType}.${event.eventName}...`);
      
      try {
        const subscriptionResponse = await callNexhealthManagementApi(
          `/webhook_endpoints/${globalNexhealthEndpointId}/webhook_subscriptions`,
          {
            method: 'POST',
            body: { resource_type: event.resourceType, event: event.eventName, active: true },
            params: { subdomain: practiceSubdomain } // NexHealth API uses subdomain as a query parameter here
          }
        );
        const nexhealthSubscriptionId = String(subscriptionResponse.data.id);

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
            nexhealthWebhookEndpointId: globalNexhealthEndpointId, // Store reference to the global endpoint ID from NexHealth
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
        console.log(`   ✅ Successfully subscribed to ${event.resourceType}.${event.eventName}. NexHealth Subscription ID: ${nexhealthSubscriptionId}`);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Failed to subscribe to ${event.resourceType}.${event.eventName}: ${error.message}`);
        // Continue with other events even if one fails
      }
    }
    
    console.log(`🎉 Practice "${practiceSubdomain}" event subscriptions processed.`);
    console.log(`   ✅ Successfully subscribed: ${successCount}`);
    console.log(`   👍 Already subscribed: ${skipCount}`);
    console.log(`   ❌ Failed: ${eventsToSubscribe.length - successCount - skipCount}`);

  } catch (error) {
    console.error(`❌ Error subscribing practice "${practiceSubdomain}":`, error.message);
    if (error.response?.data) console.error("NexHealth Error:", error.response.data);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// --- Command: list-subscriptions [practice_subdomain] ---
async function listSubscriptions(practiceSubdomain) {
  console.log('📋 Listing NexHealth webhook subscriptions...');

  try {
    let whereClause = {};
    
    if (practiceSubdomain) {
      const practice = await prisma.practice.findFirst({ where: { nexhealthSubdomain: practiceSubdomain } });
      if (!practice) {
        console.error(`❌ Practice with subdomain "${practiceSubdomain}" not found.`);
        process.exit(1);
      }
      whereClause.practiceId = practice.id;
      console.log(`🔍 Filtering by practice: ${practiceSubdomain} (ID: ${practice.id})`);
    }

    const subscriptions = await prisma.nexhealthWebhookSubscription.findMany({
      where: whereClause,
      include: {
        practice: true,
      },
      orderBy: [
        { practice: { nexhealthSubdomain: 'asc' } },
        { resourceType: 'asc' },
        { eventName: 'asc' },
      ],
    });

    if (subscriptions.length === 0) {
      console.log('   No subscriptions found.');
      return;
    }

    console.log(`\n📊 Found ${subscriptions.length} subscription(s):\n`);
    
    let currentPractice = null;
    for (const sub of subscriptions) {
      if (currentPractice !== sub.practice.nexhealthSubdomain) {
        currentPractice = sub.practice.nexhealthSubdomain;
        console.log(`🏥 Practice: ${currentPractice || 'Unknown'}`);
      }
      
      const status = sub.isActive ? '✅ Active' : '❌ Inactive';
      console.log(`   ${status} | ${sub.resourceType}.${sub.eventName} | NexHealth ID: ${sub.nexhealthSubscriptionId}`);
    }

  } catch (error) {
    console.error('❌ Error listing subscriptions:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// --- Main CLI Logic ---
async function main() {
  if (!MASTER_NEXHEALTH_API_KEY) {
    console.error('❌ NEXHEALTH_API_KEY (master key) not found in environment variables. Please set it in your .env file.');
    process.exit(1);
  }

  const command = process.argv[2];
  const arg1 = process.argv[3];

  console.log('🔧 NexHealth Webhook Management Tool');
  console.log('=====================================\n');

  if (command === 'setup-global-endpoint') {
    await setupGlobalEndpoint();
  } else if (command === 'subscribe-practice') {
    await subscribePractice(arg1);
  } else if (command === 'list-subscriptions') {
    await listSubscriptions(arg1);
  } else {
    console.log('Available commands:');
    console.log('');
    console.log('  setup-global-endpoint');
    console.log('    Creates/updates the global webhook endpoint on NexHealth');
    console.log('    and stores configuration in database');
    console.log('');
    console.log('  subscribe-practice <practice_subdomain>');
    console.log('    Subscribes a practice to NexHealth events');
    console.log('    Example: node scripts/manage-nexhealth-webhooks.js subscribe-practice dentistoffice');
    console.log('');
    console.log('  list-subscriptions [practice_subdomain]');
    console.log('    Lists all webhook subscriptions, optionally filtered by practice');
    console.log('    Example: node scripts/manage-nexhealth-webhooks.js list-subscriptions');
    console.log('    Example: node scripts/manage-nexhealth-webhooks.js list-subscriptions dentistoffice');
    console.log('');
    process.exit(1);
  }
}

main().catch(e => {
  console.error("❌ Unhandled error in script:", e);
  prisma.$disconnect();
  process.exit(1);
}); 