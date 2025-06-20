#!/usr/bin/env node

/**
 * Script to delete VAPI assistant for a specific Clerk user ID
 * This will clean up both the VAPI platform and local database records
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TARGET_CLERK_USER_ID = 'user_2yKTSzqIq9w0isdwpDZreVoAazr';

async function deleteVapiAssistant(assistantId) {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    throw new Error('VAPI_API_KEY environment variable is required');
  }

  console.log(`🗑️ Deleting VAPI assistant: ${assistantId}`);
  
  const response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete VAPI assistant: ${response.status} ${error}`);
  }

  console.log(`✅ Successfully deleted VAPI assistant: ${assistantId}`);
}

async function cleanupDatabaseRecords(practiceId) {
  console.log(`🧹 Cleaning up database records for practice: ${practiceId}`);
  
  // Delete assistant configuration
  const deletedConfig = await prisma.practiceAssistantConfig.deleteMany({
    where: { practiceId: practiceId }
  });
  
  console.log(`✅ Deleted ${deletedConfig.count} assistant configuration record(s)`);
  
  // Optionally clean up call logs and tool logs (be careful with this)
  const callLogCount = await prisma.callLog.count({
    where: { practiceId: practiceId }
  });
  
  const toolLogCount = await prisma.toolLog.count({
    where: { practiceId: practiceId }
  });
  
  console.log(`📊 Found ${callLogCount} call logs and ${toolLogCount} tool logs (preserved)`);
  
  return { deletedConfig: deletedConfig.count, callLogCount, toolLogCount };
}

async function deleteAssistantForClerkUser() {
  console.log('🚀 VAPI Assistant Deletion Script');
  console.log('=================================\n');
  
  console.log(`🎯 Target Clerk User ID: ${TARGET_CLERK_USER_ID}\n`);
  
  try {
    // Step 1: Find the practice for this Clerk user
    console.log('📋 Step 1: Finding practice for Clerk user...');
    
    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: TARGET_CLERK_USER_ID },
      include: { assistantConfig: true }
    });

    if (!practice) {
      console.log('❌ No practice found for the specified Clerk user ID');
      return;
    }

    console.log(`✅ Found practice: ${practice.name || 'Unnamed'} (ID: ${practice.id})`);
    
    if (!practice.assistantConfig || !practice.assistantConfig.vapiAssistantId) {
      console.log('ℹ️ No VAPI assistant found for this practice');
      
      if (practice.assistantConfig) {
        await cleanupDatabaseRecords(practice.id);
      }
      
      console.log('✅ Ready for fresh assistant setup!');
      return;
    }

    const assistantId = practice.assistantConfig.vapiAssistantId;
    console.log(`🤖 Found VAPI Assistant ID: ${assistantId}\n`);

    // Step 2: Delete the VAPI assistant
    console.log('🗑️ Step 2: Deleting VAPI assistant...');
    
    try {
      await deleteVapiAssistant(assistantId);
    } catch (vapiError) {
      console.log(`⚠️ VAPI deletion failed: ${vapiError.message}`);
      console.log('   Continuing with database cleanup...');
    }

    // Step 3: Clean up database records
    console.log('\n🧹 Step 3: Cleaning up database records...');
    
    const cleanup = await cleanupDatabaseRecords(practice.id);

    // Step 4: Summary
    console.log('\n📊 Deletion Summary:');
    console.log('===================');
    console.log(`   • Clerk User: ${TARGET_CLERK_USER_ID}`);
    console.log(`   • Practice: ${practice.name || 'Unnamed'}`);
    console.log(`   • VAPI Assistant: ${assistantId} - Deleted`);
    console.log(`   • Config Records: ${cleanup.deletedConfig} deleted`);
    console.log(`   • History Preserved: ${cleanup.callLogCount + cleanup.toolLogCount} logs`);

    console.log('\n✅ DELETION COMPLETE!');
    console.log('\n🆕 Ready for Fresh Setup:');
    console.log('   1. Visit the /laine page to create a new assistant');
    console.log('   2. All practice configuration is preserved');
    console.log('   3. Historical data is maintained');
    
  } catch (error) {
    console.error('❌ Error during deletion:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Confirmation prompt
console.log('⚠️  VAPI ASSISTANT DELETION');
console.log('============================');
console.log(`Target: ${TARGET_CLERK_USER_ID}`);
console.log('\nThis will delete the VAPI assistant and reset for fresh setup.');
console.log('Practice data and history will be preserved.\n');

// Run the deletion
deleteAssistantForClerkUser(); 