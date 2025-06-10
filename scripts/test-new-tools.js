#!/usr/bin/env node

/**
 * Test script for Phase 2 new tools
 * Tests: get_practice_details, check_insurance_participation, get_service_cost_estimate, enhanced create_new_patient
 * Usage: node scripts/test-new-tools.js
 */

const fetch = require('node-fetch');

// Base payload structure for VAPI tool calls
function createBasePayload(toolName, args) {
  return {
    message: {
      type: "tool-calls",
      call: {
        id: "test-call-id-" + Date.now(),
        assistantId: "6edf21b8-efc7-4b3b-bdcb-1237b35401d9", // Test assistant ID
      },
      assistant: {
        id: "6edf21b8-efc7-4b3b-bdcb-1237b35401d9",
        name: "Royal Oak Family Dental - Laine"
      },
      toolCallList: [
        {
          id: "call_" + Math.random().toString(36).substr(2, 9),
          type: "function",
          function: {
            name: toolName,
            arguments: JSON.stringify(args)
          }
        }
      ]
    }
  };
}

async function makeToolCall(toolName, args, description) {
  console.log(`\n🧪 Testing: ${toolName}`);
  console.log(`📝 Description: ${description}`);
  console.log(`📤 Arguments:`, JSON.stringify(args, null, 2));

  try {
    const payload = createBasePayload(toolName, args);
    
    const response = await fetch('http://localhost:3000/api/vapi/tool-calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok && result.results && result.results.length > 0) {
      const toolResult = JSON.parse(result.results[0].result);
      
      console.log(`📥 Result:`);
      console.log(`   Success: ${toolResult.success}`);
      console.log(`   Message: ${toolResult.message_to_patient}`);
      if (toolResult.error_code) {
        console.log(`   Error Code: ${toolResult.error_code}`);
      }
      if (toolResult.data) {
        console.log(`   Data:`, JSON.stringify(toolResult.data, null, 4));
      }
      
      return toolResult.success ? '✅' : '⚠️';
    } else {
      console.log(`❌ HTTP Error: ${response.status}`);
      console.log(`   Response:`, JSON.stringify(result, null, 2));
      return '❌';
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return '❌';
  }
}

async function testAllNewTools() {
  console.log('🧪 Testing Phase 2 New Tools');
  console.log('============================');

  const results = [];

  // Test 1: get_practice_details
  results.push({
    tool: 'get_practice_details',
    status: await makeToolCall(
      'get_practice_details',
      {},
      'Retrieves practice address and location details'
    )
  });

  // Test 2: check_insurance_participation - In-network test
  results.push({
    tool: 'check_insurance_participation (in-network)',
    status: await makeToolCall(
      'check_insurance_participation',
      { insuranceProviderName: 'Cigna' },
      'Checks if practice accepts Cigna insurance'
    )
  });

  // Test 3: check_insurance_participation - Out-of-network test
  results.push({
    tool: 'check_insurance_participation (out-of-network)',
    status: await makeToolCall(
      'check_insurance_participation',
      { insuranceProviderName: 'Unknown Insurance Co' },
      'Checks if practice accepts unknown insurance'
    )
  });

  // Test 4: get_service_cost_estimate - Existing service
  results.push({
    tool: 'get_service_cost_estimate (existing)',
    status: await makeToolCall(
      'get_service_cost_estimate',
      { serviceName: 'cleaning' },
      'Gets cost estimate for dental cleaning'
    )
  });

  // Test 5: get_service_cost_estimate - Non-existing service
  results.push({
    tool: 'get_service_cost_estimate (non-existing)',
    status: await makeToolCall(
      'get_service_cost_estimate',
      { serviceName: 'root canal surgery' },
      'Gets cost estimate for service not in system'
    )
  });

  // Test 6: create_new_patient - Without insurance
  results.push({
    tool: 'create_new_patient (no insurance)',
    status: await makeToolCall(
      'create_new_patient',
      {
        firstName: 'Jane',
        lastName: 'TestPatient',
        dateOfBirth: '1985-06-15',
        phone: '3135551234',
        email: 'jane.test@example.com'
      },
      'Creates new patient without insurance information'
    )
  });

  // Test 7: create_new_patient - With insurance
  results.push({
    tool: 'create_new_patient (with insurance)',
    status: await makeToolCall(
      'create_new_patient',
      {
        firstName: 'John',
        lastName: 'TestPatient',
        dateOfBirth: '1990-03-20',
        phone: '3135555678',
        email: 'john.test@example.com',
        insurance_name: 'Blue Cross Blue Shield'
      },
      'Creates new patient with insurance information'
    )
  });

  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('=======================');
  results.forEach(result => {
    console.log(`${result.status} ${result.tool}`);
  });

  const successCount = results.filter(r => r.status === '✅').length;
  const warningCount = results.filter(r => r.status === '⚠️').length;
  const errorCount = results.filter(r => r.status === '❌').length;

  console.log(`\n📈 Overall Results:`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ⚠️ Warnings: ${warningCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);

  if (errorCount === 0) {
    console.log('\n🎉 All tools are working correctly!');
  } else {
    console.log('\n⚠️ Some tools need attention. Check the logs above.');
  }
}

// Check if server is running
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

  await testAllNewTools();
}

main().catch(console.error); 