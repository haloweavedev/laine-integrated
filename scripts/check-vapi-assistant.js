#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function checkVapiAssistant() {
  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = '6edf21b8-efc7-4b3b-bdcb-1237b35401d9';
  
  try {
    const response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    if (!response.ok) {
      console.error('❌ VAPI API Error:', response.status, await response.text());
      return;
    }
    
    const data = await response.json();
    
    console.log('🔧 VAPI Assistant Configuration:');
    console.log('   ID:', data.id);
    console.log('   Name:', data.name);
    console.log('   Created:', data.createdAt);
    console.log('   Updated:', data.updatedAt);
    
    if (data.name === 'Practice - Laine') {
      console.log('\n❌ ISSUE FOUND: Assistant name is still "Practice - Laine"');
      console.log('   Expected: "Royal Oak Family Dental - Laine"');
      console.log('   This explains why tool calls are failing!');
    } else {
      console.log('\n✅ Assistant name looks correct');
    }
    
  } catch (error) {
    console.error('❌ Error checking VAPI assistant:', error);
  }
}

checkVapiAssistant(); 