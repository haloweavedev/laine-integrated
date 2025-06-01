#!/usr/bin/env node

/**
 * Debug script to check VAPI assistant ID mapping and practice configuration
 * Usage: node scripts/debug-assistant-mapping.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 LAINE Assistant ID Mapping Diagnostic');
  console.log('=========================================\n');

  try {
    // 1. Check all practices
    console.log('📋 Checking Practice Configuration:');
    const practices = await prisma.practice.findMany({
      include: {
        assistantConfig: true,
        appointmentTypes: true,
        savedProviders: {
          include: {
            provider: true
          }
        },
        savedOperatories: true
      }
    });

    if (practices.length === 0) {
      console.log('❌ No practices found in database!');
      return;
    }

    practices.forEach((practice, index) => {
      console.log(`\n${index + 1}. Practice: ${practice.name || 'Unnamed'}`);
      console.log(`   ID: ${practice.id}`);
      console.log(`   Clerk User ID: ${practice.clerkUserId}`);
      console.log(`   NexHealth Subdomain: ${practice.nexhealthSubdomain || 'Not set'}`);
      console.log(`   NexHealth Location ID: ${practice.nexhealthLocationId || 'Not set'}`);
      
      if (practice.assistantConfig) {
        console.log(`   ✅ VAPI Assistant ID: ${practice.assistantConfig.vapiAssistantId}`);
      } else {
        console.log(`   ❌ No VAPI Assistant ID configured!`);
      }
      
      console.log(`   📋 Appointment Types: ${practice.appointmentTypes.length}`);
      console.log(`   👥 Saved Providers: ${practice.savedProviders.length}`);
      console.log(`   🏠 Saved Operatories: ${practice.savedOperatories.length}`);
      
      // Check scheduling readiness
      const isReady = practice.appointmentTypes.length > 0 && 
                     practice.savedProviders.length > 0 && 
                     practice.nexhealthSubdomain && 
                     practice.nexhealthLocationId;
      
      console.log(`   🎯 Scheduling Ready: ${isReady ? '✅ YES' : '❌ NO'}`);
    });

    // 2. Check orphaned assistant configs
    console.log('\n\n🔗 Checking Assistant Configurations:');
    const assistantConfigs = await prisma.practiceAssistantConfig.findMany({
      include: {
        practice: true
      }
    });

    if (assistantConfigs.length === 0) {
      console.log('❌ No assistant configurations found!');
    } else {
      assistantConfigs.forEach((config, index) => {
        console.log(`\n${index + 1}. Assistant Config:`);
        console.log(`   VAPI Assistant ID: ${config.vapiAssistantId}`);
        console.log(`   Practice: ${config.practice.name || 'Unnamed'} (${config.practice.id})`);
      });
    }

    // 3. Suggest fixes for common issues
    console.log('\n\n🛠️  Common Issues & Solutions:');
    
    const practicesWithoutAssistant = practices.filter(p => !p.assistantConfig);
    if (practicesWithoutAssistant.length > 0) {
      console.log('\n❌ Practices without VAPI Assistant ID:');
      practicesWithoutAssistant.forEach(practice => {
        console.log(`   - ${practice.name || 'Unnamed'} (${practice.id})`);
      });
      console.log('\n💡 Solution: Configure VAPI assistant for these practices');
    }

    const practicesNotReady = practices.filter(p => 
      p.appointmentTypes.length === 0 || 
      p.savedProviders.length === 0 || 
      !p.nexhealthSubdomain || 
      !p.nexhealthLocationId
    );
    
    if (practicesNotReady.length > 0) {
      console.log('\n⚠️  Practices not ready for scheduling:');
      practicesNotReady.forEach(practice => {
        console.log(`   - ${practice.name || 'Unnamed'}:`);
        if (!practice.nexhealthSubdomain) console.log('     • Missing NexHealth subdomain');
        if (!practice.nexhealthLocationId) console.log('     • Missing NexHealth location ID');
        if (practice.appointmentTypes.length === 0) console.log('     • No appointment types synced');
        if (practice.savedProviders.length === 0) console.log('     • No providers selected');
      });
      console.log('\n💡 Solution: Complete practice configuration and sync NexHealth data');
    }

    // 4. Generate test payload for debugging
    if (assistantConfigs.length > 0) {
      const firstConfig = assistantConfigs[0];
      console.log('\n\n🧪 Test VAPI Payload (for debugging):');
      console.log('Copy this payload structure to test tool calls:');
      console.log(JSON.stringify({
        message: {
          type: "tool-calls",
          call: {
            id: "test-call-id-" + Date.now(),
            assistantId: firstConfig.vapiAssistantId, // This should match your database
          },
          assistant: {
            id: firstConfig.vapiAssistantId,
            name: `${firstConfig.practice.name} - Laine`
          },
          toolCallList: [
            {
              toolCallId: "test-tool-call-1",
              name: "findPatient",
              arguments: JSON.stringify({
                firstName: "John",
                lastName: "Doe",
                dateOfBirth: "1990-01-01"
              })
            }
          ]
        }
      }, null, 2));
    }

    console.log('\n\n✅ Diagnostic complete!');

  } catch (error) {
    console.error('❌ Error running diagnostic:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error); 