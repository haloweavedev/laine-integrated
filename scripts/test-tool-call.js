#!/usr/bin/env node

/**
 * Test script to simulate VAPI tool call with enhanced extraction
 * Usage: node scripts/test-tool-call.js
 */

const fetch = require('node-fetch');

async function testToolCall() {
  console.log('🧪 Testing VAPI Tool Call Handler');
  console.log('==================================\n');

  try {
    // Simulate the VAPI payload structure based on the analysis
    const testPayload = {
      message: {
        type: "tool-calls",
        call: {
          id: "test-call-id-" + Date.now(),
          assistantId: "6edf21b8-efc7-4b3b-bdcb-1237b35401d9", // From our diagnostic
        },
        assistant: {
          id: "6edf21b8-efc7-4b3b-bdcb-1237b35401d9",
          name: "Royal Oak Family Dental - Laine"
        },
        toolCallList: [
          {
            id: "call_gEU0qfSBNk9xK4LStkpJCGQo",
            type: "function",
            function: {
              name: "findPatient", // This should now be extracted correctly
              arguments: JSON.stringify({
                firstName: "John",
                lastName: "Doe", 
                dateOfBirth: "1990-01-01"
              })
            }
          }
        ]
      }
    };

    console.log('📤 Sending test payload to tool handler:');
    console.log(JSON.stringify(testPayload, null, 2));
    console.log('\n');

    // Make request to the tool call handler
    const response = await fetch('http://localhost:3000/api/vapi/tool-calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    const result = await response.json();

    console.log('📥 Response from tool handler:');
    console.log('Status:', response.status);
    console.log('Body:', JSON.stringify(result, null, 2));

    if (response.ok) {
      console.log('\n✅ Test completed successfully!');
      
      // Check if we got expected structure
      if (result.results && result.results.length > 0) {
        const firstResult = result.results[0];
        const parsedResult = JSON.parse(firstResult.result);
        
        console.log('\n📋 Tool execution result:');
        console.log('- Success:', parsedResult.success);
        console.log('- Error Code:', parsedResult.error_code || 'None');
        console.log('- Message:', parsedResult.message_to_patient || parsedResult.message || 'None');
        
        if (parsedResult.success) {
          console.log('🎉 Tool call executed successfully!');
        } else {
          console.log('⚠️ Tool call failed, but handler worked correctly');
          console.log('   This may be expected if test data doesn\'t exist in NexHealth');
        }
      }
    } else {
      console.log('\n❌ Test failed with HTTP error');
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure the development server is running:');
      console.log('   pnpm dev');
    }
  }
}

// Check if server is running first
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/api/vapi/tool-calls', {
      method: 'GET'
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('🚨 Development server is not running!');
    console.log('Please start it first with: pnpm dev');
    console.log('Then run this test again.\n');
    return;
  }

  await testToolCall();
}

main().catch(console.error); 