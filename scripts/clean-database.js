#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listUsers() {
  console.log('📋 Current database state:');
  console.log('==========================\n');

  try {
    // List practices
    const practices = await prisma.practice.findMany({
      include: {
        nexhealthWebhookSubscriptions: true,
        appointmentTypes: true,
        providers: true,
        assistantConfig: true,
        callLogs: true
      }
    });

    console.log(`🏥 Practices (${practices.length}):`);
    if (practices.length === 0) {
      console.log('   No practices found\n');
    } else {
      practices.forEach(practice => {
        console.log(`   • ${practice.id}`);
        console.log(`     - Clerk User: ${practice.clerkUserId}`);
        console.log(`     - Name: ${practice.name || 'N/A'}`);
        console.log(`     - Subdomain: ${practice.nexhealthSubdomain || 'N/A'}`);
        console.log(`     - Location ID: ${practice.nexhealthLocationId || 'N/A'}`);
        console.log(`     - Webhook Subscriptions: ${practice.nexhealthWebhookSubscriptions.length}`);
        console.log(`     - Appointment Types: ${practice.appointmentTypes.length}`);
        console.log(`     - Providers: ${practice.providers.length}`);
        console.log(`     - Call Logs: ${practice.callLogs.length}`);
        console.log(`     - Assistant Config: ${practice.assistantConfig ? 'Yes' : 'No'}`);
        console.log('');
      });
    }

    // List webhook subscriptions
    const webhookSubs = await prisma.nexhealthWebhookSubscription.findMany({
      include: { practice: true }
    });

    console.log(`🔗 Webhook Subscriptions (${webhookSubs.length}):`);
    if (webhookSubs.length === 0) {
      console.log('   No webhook subscriptions found\n');
    } else {
      webhookSubs.forEach(sub => {
        console.log(`   • ${sub.id} - ${sub.resourceType}.${sub.eventName}`);
        console.log(`     - Practice: ${sub.practice?.nexhealthSubdomain || 'ORPHANED'}`);
        console.log(`     - NexHealth ID: ${sub.nexhealthSubscriptionId}`);
        console.log(`     - Active: ${sub.isActive}`);
        console.log('');
      });
    }

    // List global webhook endpoint
    const globalEndpoint = await prisma.globalNexhealthWebhookEndpoint.findUnique({
      where: { id: "singleton" }
    });

    console.log(`🌐 Global Webhook Endpoint:`);
    if (globalEndpoint) {
      console.log(`   • ID: ${globalEndpoint.id}`);
      console.log(`   • NexHealth Endpoint ID: ${globalEndpoint.nexhealthEndpointId}`);
      console.log(`   • Target URL: ${globalEndpoint.targetUrl}`);
      console.log(`   • Enabled: ${globalEndpoint.isEnabled}`);
      console.log('');
    } else {
      console.log('   No global webhook endpoint found\n');
    }

    // List assistant configs
    const assistantConfigs = await prisma.practiceAssistantConfig.findMany({
      include: { practice: true }
    });

    console.log(`🤖 Assistant Configs (${assistantConfigs.length}):`);
    if (assistantConfigs.length === 0) {
      console.log('   No assistant configs found\n');
    } else {
      assistantConfigs.forEach(config => {
        console.log(`   • ${config.id}`);
        console.log(`     - Practice: ${config.practice?.nexhealthSubdomain || 'ORPHANED'}`);
        console.log(`     - VAPI Assistant ID: ${config.vapiAssistantId || 'N/A'}`);
        console.log(`     - Voice Provider: ${config.voiceProvider}`);
        console.log('');
      });
    }

    // List token cache
    const tokenCache = await prisma.nexhealthTokenCache.findUnique({
      where: { id: "singleton" }
    });

    console.log(`🔑 Token Cache:`);
    if (tokenCache) {
      console.log(`   • Expires at: ${tokenCache.expiresAt}`);
      console.log(`   • Created: ${tokenCache.createdAt}`);
      console.log('');
    } else {
      console.log('   No token cache found\n');
    }

  } catch (error) {
    console.error('❌ Error listing database contents:', error.message);
  }
}

async function cleanTestData() {
  console.log('🧹 Cleaning test data from database...');
  console.log('=====================================\n');

  try {
    let deletedCount = 0;

    // Define test patterns
    const testPatterns = {
      clerkUserIds: ['test_user_xyz', 'user_2example123'],
      subdomains: ['xyz', 'testdental', 'test'],
      practiceNames: ['Test Practice XYZ', 'Test Practice']
    };

    // Find and delete test practices and all their related data
    const testPractices = await prisma.practice.findMany({
      where: {
        OR: [
          { clerkUserId: { in: testPatterns.clerkUserIds } },
          { nexhealthSubdomain: { in: testPatterns.subdomains } },
          { name: { in: testPatterns.practiceNames } },
          { clerkUserId: { startsWith: 'test_' } },
          { clerkUserId: { startsWith: 'user_2example' } }
        ]
      }
    });

    if (testPractices.length > 0) {
      console.log(`Found ${testPractices.length} test practice(s) to clean:`);
      testPractices.forEach(practice => {
        console.log(`   • ${practice.nexhealthSubdomain || practice.name || practice.id} (Clerk: ${practice.clerkUserId})`);
      });
      console.log('');

      // Delete practices (cascade will handle related records)
      const result = await prisma.practice.deleteMany({
        where: {
          id: { in: testPractices.map(p => p.id) }
        }
      });

      deletedCount += result.count;
      console.log(`✅ Deleted ${result.count} test practice(s) and all related data\n`);
    } else {
      console.log('✅ No test practices found to clean\n');
    }

    // Clean orphaned webhook subscriptions (those without valid practices)
    // Note: This should be handled by cascading deletes, but let's check anyway
    const allSubs = await prisma.nexhealthWebhookSubscription.findMany();
    const practiceIds = new Set((await prisma.practice.findMany({ select: { id: true } })).map(p => p.id));
    
    const orphanedSubs = allSubs.filter(sub => !practiceIds.has(sub.practiceId));
    
    if (orphanedSubs.length > 0) {
      const orphanedResult = await prisma.nexhealthWebhookSubscription.deleteMany({
        where: {
          id: { in: orphanedSubs.map(sub => sub.id) }
        }
      });
      deletedCount += orphanedResult.count;
      console.log(`✅ Deleted ${orphanedResult.count} orphaned webhook subscription(s)\n`);
    }

    // Clean webhook subscriptions with null/undefined nexhealthSubscriptionId
    // (This is mostly handled by cascading deletes, but check for any stragglers)
    try {
      const invalidSubs = await prisma.nexhealthWebhookSubscription.deleteMany({
        where: {
          nexhealthSubscriptionId: ""
        }
      });

      if (invalidSubs.count > 0) {
        deletedCount += invalidSubs.count;
        console.log(`✅ Deleted ${invalidSubs.count} invalid webhook subscription(s)\n`);
      }
    } catch (error) {
      // Skip this cleanup step if it fails
      console.log(`ℹ️  Skipped invalid subscription cleanup: ${error.message}\n`);
    }

    console.log(`🎉 Database cleanup completed! Total records cleaned: ${deletedCount}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    throw error;
  }
}

async function cleanAll() {
  console.log('⚠️  DANGER: This will delete ALL data from the database!');
  console.log('==========================================\n');

  try {
    let deletedCount = 0;

    // Delete in correct order to respect foreign key constraints
    const results = await Promise.all([
      prisma.callLog.deleteMany(),
      prisma.nexhealthWebhookSubscription.deleteMany(),
      prisma.practiceAssistantConfig.deleteMany(),
      prisma.appointmentType.deleteMany(),
      prisma.provider.deleteMany(),
    ]);

    results.forEach(result => deletedCount += result.count);

    // Delete practices last
    const practiceResult = await prisma.practice.deleteMany();
    deletedCount += practiceResult.count;

    // Delete global configurations
    const globalResults = await Promise.all([
      prisma.globalNexhealthWebhookEndpoint.deleteMany(),
      prisma.nexhealthTokenCache.deleteMany(),
    ]);

    globalResults.forEach(result => deletedCount += result.count);

    console.log(`✅ Deleted all data! Total records cleaned: ${deletedCount}`);

  } catch (error) {
    console.error('❌ Error during full cleanup:', error.message);
    throw error;
  }
}

async function main() {
  const command = process.argv[2];

  console.log('🧹 Database Cleanup Tool');
  console.log('========================\n');

  try {
    if (command === 'list') {
      await listUsers();
    } else if (command === 'clean-test') {
      await listUsers();
      await cleanTestData();
      console.log('\n📋 Database state after cleanup:');
      console.log('================================\n');
      await listUsers();
    } else if (command === 'clean-all') {
      console.log('⚠️  Are you sure you want to delete ALL data? This cannot be undone!');
      console.log('Use: node scripts/clean-database.js clean-all-confirmed');
      process.exit(1);
    } else if (command === 'clean-all-confirmed') {
      await listUsers();
      await cleanAll();
      console.log('\n📋 Database state after cleanup:');
      console.log('================================\n');
      await listUsers();
    } else {
      console.log('Available commands:');
      console.log('');
      console.log('  list');
      console.log('    Lists all current database contents');
      console.log('');
      console.log('  clean-test');
      console.log('    Removes test data and orphaned records');
      console.log('    Safe to run - only removes obviously test data');
      console.log('');
      console.log('  clean-all');
      console.log('    Removes ALL data from database (requires confirmation)');
      console.log('');
      console.log('Examples:');
      console.log('  node scripts/clean-database.js list');
      console.log('  node scripts/clean-database.js clean-test');
      console.log('');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main(); 