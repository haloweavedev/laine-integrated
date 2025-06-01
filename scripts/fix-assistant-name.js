#!/usr/bin/env node

/**
 * Fix script to update VAPI assistant name to match practice name
 * This resolves the practice lookup issue where assistant name fallback fails
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateVapiAssistant(assistantId, updateData) {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    throw new Error('VAPI_API_KEY environment variable is required');
  }

  const response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateData)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update VAPI assistant: ${response.status} ${error}`);
  }

  return await response.json();
}

async function main() {
  console.log('🔧 LAINE Assistant Name Fix');
  console.log('============================\n');

  try {
    // Get the practice with assistant config
    const practice = await prisma.practice.findFirst({
      include: {
        assistantConfig: true
      }
    });

    if (!practice) {
      console.log('❌ No practice found in database');
      return;
    }

    if (!practice.assistantConfig?.vapiAssistantId) {
      console.log('❌ No VAPI assistant configured for practice');
      return;
    }

    console.log('📋 Current Configuration:');
    console.log(`   Practice Name: ${practice.name}`);
    console.log(`   VAPI Assistant ID: ${practice.assistantConfig.vapiAssistantId}`);
    
    // Generate correct assistant name (remove the 15-char limit for name)
    const correctAssistantName = `${practice.name || 'Practice'} - Laine`;
    console.log(`   Correct Assistant Name: ${correctAssistantName}`);
    
    console.log('\n🔄 Updating VAPI assistant name...');
    
    const updateResult = await updateVapiAssistant(practice.assistantConfig.vapiAssistantId, {
      name: correctAssistantName
    });
    
    console.log('✅ Successfully updated VAPI assistant name!');
    console.log(`   New name: ${updateResult.name}`);
    
    console.log('\n🧪 Test the fix:');
    console.log('   1. Make a test call to your VAPI assistant');
    console.log('   2. Check that tools now work correctly');
    console.log('   3. Verify practice lookup succeeds in logs');

  } catch (error) {
    console.error('❌ Error fixing assistant name:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main(); 