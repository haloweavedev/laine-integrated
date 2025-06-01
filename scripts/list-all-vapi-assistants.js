#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function listAllVapiAssistants() {
  const apiKey = process.env.VAPI_API_KEY;
  
  try {
    const response = await fetch('https://api.vapi.ai/assistant', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    if (!response.ok) {
      console.error('❌ VAPI API Error:', response.status, await response.text());
      return;
    }
    
    const assistants = await response.json();
    
    console.log('🔧 All VAPI Assistants:');
    console.log('=======================\n');
    
    assistants.forEach((assistant, index) => {
      console.log(`${index + 1}. Assistant:`);
      console.log(`   ID: ${assistant.id}`);
      console.log(`   Name: ${assistant.name}`);
      console.log(`   Created: ${assistant.createdAt}`);
      console.log(`   Updated: ${assistant.updatedAt}`);
      
      if (assistant.name.includes('Practice - Laine')) {
        console.log('   ⚠️  POTENTIAL ISSUE: This has the problematic name!');
      }
      
      if (assistant.name.includes('Royal Oak')) {
        console.log('   ✅ This looks like the correct assistant');
      }
      
      console.log('');
    });
    
    console.log(`Total assistants: ${assistants.length}`);
    
    const problemAssistants = assistants.filter(a => a.name === 'Practice - Laine');
    if (problemAssistants.length > 0) {
      console.log('\n❌ FOUND PROBLEM ASSISTANTS:');
      problemAssistants.forEach(assistant => {
        console.log(`   ID: ${assistant.id} | Name: ${assistant.name}`);
      });
      console.log('\nThese might be causing conflicts!');
    }
    
  } catch (error) {
    console.error('❌ Error listing VAPI assistants:', error);
  }
}

listAllVapiAssistants(); 