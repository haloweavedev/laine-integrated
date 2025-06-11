#!/usr/bin/env node

/**
 * Script to delete a specific user and all their associated data
 * Usage: node scripts/delete-user-data.js <clerkUserId>
 * Example: node scripts/delete-user-data.js user_2xr55vFhdnIKKgEXSGdN1luXQEq
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function deleteUserData(clerkUserId) {
  console.log('🗑️  User Data Deletion Script');
  console.log('===========================\n');
  
  console.log(`Target User ID: ${clerkUserId}\n`);

  try {
    // First, find the practice(s) associated with this user
    const practices = await prisma.practice.findMany({
      where: { clerkUserId },
      include: {
        assistantConfig: true,
        appointmentTypes: true,
        providers: true,
        savedProviders: true,
        savedOperatories: true,
        manualAvailabilities: true,
        nexhealthWebhookSubscriptions: true,
        callLogs: {
          include: {
            toolLogs: true
          }
        }
      }
    });

    if (practices.length === 0) {
      console.log('❌ No practices found for this user ID.');
      return;
    }

    console.log(`📋 Found ${practices.length} practice(s) to delete:\n`);
    
    for (const practice of practices) {
      console.log(`🏥 Practice: ${practice.name || 'Unnamed'}`);
      console.log(`   ID: ${practice.id}`);
      console.log(`   NexHealth Subdomain: ${practice.nexhealthSubdomain || 'None'}`);
      console.log(`   Assistant Config: ${practice.assistantConfig ? '✅ Yes' : '❌ No'}`);
      console.log(`   Appointment Types: ${practice.appointmentTypes.length}`);
      console.log(`   Providers: ${practice.providers.length}`);
      console.log(`   Saved Providers: ${practice.savedProviders.length}`);
      console.log(`   Saved Operatories: ${practice.savedOperatories.length}`);
      console.log(`   Manual Availabilities: ${practice.manualAvailabilities.length}`);
      console.log(`   Webhook Subscriptions: ${practice.nexhealthWebhookSubscriptions.length}`);
      console.log(`   Call Logs: ${practice.callLogs.length}`);
      console.log(`   Tool Logs: ${practice.callLogs.reduce((total, call) => total + call.toolLogs.length, 0)}`);
      console.log('');
    }

    // Confirm deletion
    console.log('⚠️  WARNING: This will permanently delete ALL data associated with this user!');
    console.log('   This includes practices, appointments, call logs, and all related records.');
    console.log('   This action CANNOT be undone.\n');

    // Safety check - require --confirm flag
    if (process.argv.includes('--confirm')) {
      await performDeletion(practices);
    } else {
      console.log('🛡️  Safety Check: Add --confirm flag to actually perform the deletion.');
      console.log('   Example: node scripts/delete-user-data.js user_2xr55vFhdnIKKgEXSGdN1luXQEq --confirm');
      console.log('\n📊 This was a DRY RUN - no data was deleted.');
    }

  } catch (error) {
    console.error('❌ Error during deletion process:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function performDeletion(practices) {
  console.log('🔥 Starting deletion process...\n');

  let totalDeleted = {
    toolLogs: 0,
    callLogs: 0,
    manualAvailabilities: 0,
    nexhealthWebhookSubscriptions: 0,
    savedOperatories: 0,
    savedProviders: 0,
    appointmentTypes: 0,
    providers: 0,
    assistantConfigs: 0,
    practices: 0
  };

  try {
    // Process each practice individually to avoid transaction timeouts
    for (const practice of practices) {
      console.log(`🗑️  Deleting data for practice: ${practice.name || practice.id}`);

      // Delete in order of dependencies (children first, then parents)
      // Use individual operations instead of one large transaction

      // 1. Delete tool logs (child of call logs)
      console.log('   Deleting tool logs...');
      const toolLogsDeleted = await prisma.toolLog.deleteMany({
        where: { practiceId: practice.id }
      });
      totalDeleted.toolLogs += toolLogsDeleted.count;
      console.log(`   ✅ Deleted ${toolLogsDeleted.count} tool logs`);

      // 2. Delete call logs
      console.log('   Deleting call logs...');
      const callLogsDeleted = await prisma.callLog.deleteMany({
        where: { practiceId: practice.id }
      });
      totalDeleted.callLogs += callLogsDeleted.count;
      console.log(`   ✅ Deleted ${callLogsDeleted.count} call logs`);

      // 3. Delete manual availabilities
      console.log('   Deleting manual availabilities...');
      const manualAvailabilitiesDeleted = await prisma.manualAvailability.deleteMany({
        where: { practiceId: practice.id }
      });
      totalDeleted.manualAvailabilities += manualAvailabilitiesDeleted.count;
      console.log(`   ✅ Deleted ${manualAvailabilitiesDeleted.count} manual availabilities`);

      // 4. Delete webhook subscriptions
      console.log('   Deleting webhook subscriptions...');
      const webhookSubscriptionsDeleted = await prisma.nexhealthWebhookSubscription.deleteMany({
        where: { practiceId: practice.id }
      });
      totalDeleted.nexhealthWebhookSubscriptions += webhookSubscriptionsDeleted.count;
      console.log(`   ✅ Deleted ${webhookSubscriptionsDeleted.count} webhook subscriptions`);

      // 5. Delete saved operatories
      console.log('   Deleting saved operatories...');
      const savedOperatoriesDeleted = await prisma.savedOperatory.deleteMany({
        where: { practiceId: practice.id }
      });
      totalDeleted.savedOperatories += savedOperatoriesDeleted.count;
      console.log(`   ✅ Deleted ${savedOperatoriesDeleted.count} saved operatories`);

      // 6. Delete saved providers
      console.log('   Deleting saved providers...');
      const savedProvidersDeleted = await prisma.savedProvider.deleteMany({
        where: { practiceId: practice.id }
      });
      totalDeleted.savedProviders += savedProvidersDeleted.count;
      console.log(`   ✅ Deleted ${savedProvidersDeleted.count} saved providers`);

      // 7. Delete appointment types
      console.log('   Deleting appointment types...');
      const appointmentTypesDeleted = await prisma.appointmentType.deleteMany({
        where: { practiceId: practice.id }
      });
      totalDeleted.appointmentTypes += appointmentTypesDeleted.count;
      console.log(`   ✅ Deleted ${appointmentTypesDeleted.count} appointment types`);

      // 8. Delete providers
      console.log('   Deleting providers...');
      const providersDeleted = await prisma.provider.deleteMany({
        where: { practiceId: practice.id }
      });
      totalDeleted.providers += providersDeleted.count;
      console.log(`   ✅ Deleted ${providersDeleted.count} providers`);

      // 9. Delete assistant config
      if (practice.assistantConfig) {
        console.log('   Deleting assistant config...');
        await prisma.practiceAssistantConfig.delete({
          where: { practiceId: practice.id }
        });
        totalDeleted.assistantConfigs += 1;
        console.log(`   ✅ Deleted assistant config`);
      }

      // 10. Finally, delete the practice itself
      console.log('   Deleting practice...');
      await prisma.practice.delete({
        where: { id: practice.id }
      });
      totalDeleted.practices += 1;
      console.log(`   ✅ Deleted practice: ${practice.name || practice.id}`);

      console.log('');
    }

    console.log('🎉 Deletion completed successfully!\n');
    console.log('📊 Summary of deleted records:');
    console.log(`   Tool Logs: ${totalDeleted.toolLogs}`);
    console.log(`   Call Logs: ${totalDeleted.callLogs}`);
    console.log(`   Manual Availabilities: ${totalDeleted.manualAvailabilities}`);
    console.log(`   Webhook Subscriptions: ${totalDeleted.nexhealthWebhookSubscriptions}`);
    console.log(`   Saved Operatories: ${totalDeleted.savedOperatories}`);
    console.log(`   Saved Providers: ${totalDeleted.savedProviders}`);
    console.log(`   Appointment Types: ${totalDeleted.appointmentTypes}`);
    console.log(`   Providers: ${totalDeleted.providers}`);
    console.log(`   Assistant Configs: ${totalDeleted.assistantConfigs}`);
    console.log(`   Practices: ${totalDeleted.practices}`);
    console.log('');
    console.log('✅ User data deletion completed.');

  } catch (error) {
    console.error('❌ Error during deletion process:', error);
    throw error;
  }
}

// Main execution
async function main() {
  const clerkUserId = process.argv[2];
  
  if (!clerkUserId) {
    console.error('❌ Error: Please provide a Clerk User ID');
    console.log('Usage: node scripts/delete-user-data.js <clerkUserId> [--confirm]');
    console.log('Example: node scripts/delete-user-data.js user_2xr55vFhdnIKKgEXSGdN1luXQEq --confirm');
    process.exit(1);
  }

  if (!clerkUserId.startsWith('user_')) {
    console.error('❌ Error: Invalid Clerk User ID format. Must start with "user_"');
    process.exit(1);
  }

  try {
    await deleteUserData(clerkUserId);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { deleteUserData }; 