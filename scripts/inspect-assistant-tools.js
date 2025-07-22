#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const API_BASE_URL = 'https://api.vapi.ai';

async function apiRequest(endpoint, method = 'GET') {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VAPI API Error on ${endpoint}: ${response.status} ${errorText}`);
  }
  return response.json();
}

async function main() {
  const assistantId = '6820f09a-806c-4df7-8b41-0010fa9cc8b0';
  
  if (!VAPI_API_KEY) {
    console.error('❌ Missing required environment variable: VAPI_API_KEY');
    return;
  }
  
  console.log(`🔍 Inspecting Assistant: ${assistantId}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Get assistant details
    console.log("\n[1/3] Fetching assistant details...");
    const assistant = await apiRequest(`/assistant/${assistantId}`);
    
    console.log(`\n📋 Assistant Information:`);
    console.log(`- Name: ${assistant.name || 'N/A'}`);
    console.log(`- ID: ${assistant.id}`);
    console.log(`- Model: ${assistant.model?.model || 'N/A'}`);
    console.log(`- Voice: ${assistant.voice?.voiceId || 'N/A'}`);
    
    // Check if assistant has toolIds
    const toolIds = assistant.model?.toolIds || [];
    console.log(`\n🛠️  Configured Tool IDs (${toolIds.length}):`);
    if (toolIds.length === 0) {
      console.log('   No tools configured');
    } else {
      toolIds.forEach((toolId, index) => {
        console.log(`   ${index + 1}. ${toolId}`);
      });
    }

    // Get details for each tool
    if (toolIds.length > 0) {
      console.log("\n[2/3] Fetching tool details...");
      console.log(`\n🔧 Tool Details:`);
      
      for (let i = 0; i < toolIds.length; i++) {
        const toolId = toolIds[i];
        try {
          const tool = await apiRequest(`/tool/${toolId}`);
          console.log(`\n   ${i + 1}. ${tool.function?.name || 'Unknown'} (${toolId})`);
          console.log(`      Description: ${tool.function?.description || 'N/A'}`);
          console.log(`      Server URL: ${tool.server?.url || 'N/A'}`);
          console.log(`      Timeout: ${tool.server?.timeoutSeconds || 'N/A'}s`);
          
          if (tool.function?.parameters?.properties) {
            const params = Object.keys(tool.function.parameters.properties);
            console.log(`      Parameters: ${params.join(', ')}`);
          }
        } catch (error) {
          console.log(`   ${i + 1}. ${toolId} - ❌ Error fetching: ${error.message}`);
        }
      }
    }

    // Check system prompt
    console.log("\n[3/3] Checking system prompt...");
    const systemMessage = assistant.model?.messages?.find(msg => msg.role === 'system');
    if (systemMessage) {
      console.log(`\n💬 System Prompt (first 200 chars):`);
      console.log(`"${systemMessage.content.substring(0, 200)}..."`);
      
      // Check for key indicators
      const hasOldTool = systemMessage.content.includes('managePatientRecord');
      const hasNewTool = systemMessage.content.includes('create_patient_record');
      const hasNewFlow = systemMessage.content.includes('New Patient Registration Flow');
      
      console.log(`\n🔍 Prompt Analysis:`);
      console.log(`   Contains 'managePatientRecord': ${hasOldTool ? '❌ Yes (OLD)' : '✅ No'}`);
      console.log(`   Contains 'create_patient_record': ${hasNewTool ? '✅ Yes (NEW)' : '❌ No'}`);
      console.log(`   Contains 'New Patient Registration Flow': ${hasNewFlow ? '✅ Yes (NEW)' : '❌ No'}`);
    } else {
      console.log('   No system prompt found');
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 Summary:`);
    console.log(`   Assistant Name: ${assistant.name || 'N/A'}`);
    console.log(`   Total Tools: ${toolIds.length}`);
    
    // Check if this looks like old or new configuration
    const toolNames = [];
    for (const toolId of toolIds) {
      try {
        const tool = await apiRequest(`/tool/${toolId}`);
        toolNames.push(tool.function?.name);
      } catch (error) {
        toolNames.push('unknown');
      }
    }
    
    const hasOldPatientTool = toolNames.includes('managePatientRecord');
    const hasNewPatientTool = toolNames.includes('create_patient_record');
    
    if (hasOldPatientTool && !hasNewPatientTool) {
      console.log(`   Status: ❌ OLD CONFIGURATION (uses managePatientRecord)`);
    } else if (hasNewPatientTool && !hasOldPatientTool) {
      console.log(`   Status: ✅ NEW CONFIGURATION (uses create_patient_record)`);
    } else if (hasOldPatientTool && hasNewPatientTool) {
      console.log(`   Status: ⚠️  MIXED CONFIGURATION (has both old and new tools)`);
    } else {
      console.log(`   Status: ❓ UNCLEAR (no patient management tools found)`);
    }

  } catch (error) {
    console.error(`\n❌ Error inspecting assistant: ${error.message}`);
  }
}

main(); 