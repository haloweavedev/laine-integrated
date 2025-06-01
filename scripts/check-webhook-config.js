#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkWebhookConfig() {
  console.log('🔧 Checking Global Webhook Endpoint Configuration...\n');
  
  try {
    const config = await prisma.globalNexhealthWebhookEndpoint.findUnique({
      where: { id: 'singleton' }
    });
    
    if (config) {
      console.log('✅ Global Webhook Endpoint Found:');
      console.log('   Endpoint ID:', config.nexhealthEndpointId);
      console.log('   Target URL:', config.targetUrl);
      console.log('   Secret Key:', config.secretKey ? `${config.secretKey.substring(0, 10)}...` : 'NOT SET');
      console.log('   Enabled:', config.isEnabled);
      console.log('   Created:', config.createdAt);
      console.log('   Updated:', config.updatedAt);
      
      if (!config.secretKey) {
        console.log('\n❌ WARNING: Secret key is missing! This would cause signature verification failures.');
      } else {
        console.log('\n✅ Secret key is configured correctly.');
      }
    } else {
      console.log('❌ No global webhook endpoint found in database');
      console.log('   This would cause all webhook signature verifications to fail.');
      console.log('   Run: node scripts/manage-nexhealth-webhooks.js setup-global-endpoint');
    }
    
  } catch (error) {
    console.error('❌ Error checking webhook config:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWebhookConfig(); 