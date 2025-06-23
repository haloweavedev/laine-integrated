/**
 * Phase 4 Comprehensive Testing Script
 * 
 * Tests the enhanced error recovery, performance optimizations, and conversational flows
 * introduced in Phase 4 refactoring.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Test configuration
const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const VAPI_TOOL_CALLS_ENDPOINT = `${TEST_BASE_URL}/api/vapi/tool-calls`;

// Test scenarios
const TEST_SCENARIOS = {
  // Ideal flows
  IDEAL_NEW_PATIENT_BOOKING: {
    name: "Ideal New Patient Booking Flow",
    description: "Complete new patient registration and booking flow",
    priority: "high"
  },
  IDEAL_EXISTING_PATIENT_BOOKING: {
    name: "Ideal Existing Patient Booking Flow", 
    description: "Existing patient books appointment",
    priority: "high"
  },
  
  // User changes mind scenarios
  CHANGE_APPOINTMENT_TYPE: {
    name: "User Changes Appointment Type",
    description: "User initially requests cleaning, then changes to consultation",
    priority: "medium"
  },
  CHANGE_DATE_PREFERENCE: {
    name: "User Changes Date Preference",
    description: "User changes from requested date to alternative",
    priority: "medium"
  },
  
  // Incomplete information scenarios
  INCOMPLETE_PATIENT_INFO: {
    name: "Incomplete Patient Information",
    description: "User provides partial name or missing DOB",
    priority: "high"
  },
  AMBIGUOUS_APPOINTMENT_REQUEST: {
    name: "Ambiguous Appointment Request",
    description: "User says 'I need an appointment' without specifics",
    priority: "high"
  },
  
  // Error scenarios
  PATIENT_NOT_FOUND_ERROR: {
    name: "Patient Not Found Error",
    description: "Patient search returns no results",
    priority: "high"
  },
  NO_AVAILABILITY_ERROR: {
    name: "No Availability Error",
    description: "No slots available for requested date/type",
    priority: "high"
  },
  NEXHEALTH_API_ERROR: {
    name: "NexHealth API Error",
    description: "Simulated API connection failure",
    priority: "medium"
  },
  SLOT_TAKEN_DURING_BOOKING: {
    name: "Slot Taken During Booking",
    description: "Selected slot becomes unavailable between check and book",
    priority: "medium"
  },
  
  // Insurance and cost scenarios
  INSURANCE_CHECK_FLOW: {
    name: "Insurance Participation Check",
    description: "User asks about insurance coverage",
    priority: "medium"
  },
  COST_ESTIMATE_FLOW: {
    name: "Service Cost Estimate",
    description: "User requests cost information",
    priority: "medium"
  },
  
  // Practice information scenarios
  PRACTICE_DETAILS_REQUEST: {
    name: "Practice Details Request",
    description: "User asks for address, hours, directions",
    priority: "low"
  }
};

/**
 * Simulates a VAPI tool call payload
 */
function createVapiPayload(toolName, args, callId = 'test-call-123', assistantId = null) {
  return {
    message: {
      type: 'tool-calls',
      call: {
        id: callId,
        assistantId: assistantId
      },
      toolCallList: [
        {
          function: {
            name: toolName,
            arguments: JSON.stringify(args)
          },
          id: `test-tool-${Date.now()}`,
          type: 'function'
        }
      ]
    }
  };
}

/**
 * Makes a request to the VAPI tool calls endpoint
 */
async function makeToolCallRequest(payload) {
  try {
    const startTime = Date.now();
    
    const response = await fetch(VAPI_TOOL_CALLS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    const result = await response.json();
    
    return {
      success: response.ok,
      status: response.status,
      responseTime,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      responseTime: null,
      data: null
    };
  }
}

/**
 * Test comprehensive error recovery scenarios
 */
async function testErrorRecoveryScenarios() {
  console.log('\n=== TESTING ERROR RECOVERY SCENARIOS ===');
  
  const errorTests = [
    {
      name: 'Patient Not Found',
      payload: createVapiPayload('find_patient_in_ehr', {
        firstName: 'NonExistent',
        lastName: 'Patient',
        dateOfBirth: '1990-01-01'
      })
    },
    {
      name: 'Invalid Appointment Type',
      payload: createVapiPayload('find_appointment_type', {
        appointmentTypeDescription: 'nonexistent service'
      })
    },
    {
      name: 'Missing Required Fields',
      payload: createVapiPayload('create_new_patient', {
        firstName: 'John'
        // Missing required fields intentionally
      })
    },
    {
      name: 'Invalid Date Format',
      payload: createVapiPayload('check_available_slots', {
        requestedDate: 'invalid-date',
        appointmentTypeId: 'test-id'
      })
    }
  ];
  
  const results = [];
  
  for (const test of errorTests) {
    console.log(`\n🧪 Testing: ${test.name}`);
    
    const result = await makeToolCallRequest(test.payload);
    
    results.push({
      testName: test.name,
      success: result.success,
      responseTime: result.responseTime,
      hasUserFriendlyMessage: result.data?.message_to_patient ? true : false,
      errorCode: result.data?.error_code,
      message: result.data?.message_to_patient || result.data?.error
    });
    
    console.log(`   ✅ Response Time: ${result.responseTime}ms`);
    console.log(`   ✅ User Message: ${result.data?.message_to_patient || 'None'}`);
    console.log(`   ✅ Error Code: ${result.data?.error_code || 'None'}`);
  }
  
  return results;
}

/**
 * Test performance optimizations
 */
async function testPerformanceOptimizations() {
  console.log('\n=== TESTING PERFORMANCE OPTIMIZATIONS ===');
  
  const performanceTests = [
    {
      name: 'Generate Dynamic Message Speed',
      payload: createVapiPayload('find_appointment_type', {
        appointmentTypeDescription: 'cleaning'
      })
    },
    {
      name: 'Database Query Optimization',
      payload: createVapiPayload('check_available_slots', {
        requestedDate: '2024-12-30',
        appointmentTypeId: 'test-appointment-type-id'
      })
    },
    {
      name: 'Practice Lookup Performance',
      payload: createVapiPayload('get_practice_details', {})
    }
  ];
  
  const results = [];
  
  for (const test of performanceTests) {
    console.log(`\n⚡ Testing: ${test.name}`);
    
    // Run multiple iterations to get average response time
    const iterations = 3;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const result = await makeToolCallRequest(test.payload);
      if (result.responseTime) {
        times.push(result.responseTime);
      }
    }
    
    const averageTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    
    results.push({
      testName: test.name,
      averageResponseTime: averageTime,
      maxResponseTime: maxTime,
      minResponseTime: minTime,
      iterations
    });
    
    console.log(`   ⚡ Average: ${averageTime.toFixed(2)}ms`);
    console.log(`   ⚡ Range: ${minTime}ms - ${maxTime}ms`);
  }
  
  return results;
}

/**
 * Test flow orchestration and prerequisites
 */
async function testFlowOrchestration() {
  console.log('\n=== TESTING FLOW ORCHESTRATION ===');
  
  const flowTests = [
    {
      name: 'Book Appointment Without Patient ID',
      description: 'Should trigger flow interception',
      payload: createVapiPayload('book_appointment', {
        selectedTime: '10:00 AM',
        requestedDate: '2024-12-30'
        // Missing patientId and appointmentTypeId
      })
    },
    {
      name: 'Check Slots Without Appointment Type',
      description: 'Should ask for appointment type first',
      payload: createVapiPayload('check_available_slots', {
        requestedDate: '2024-12-30'
        // Missing appointmentTypeId
      })
    },
    {
      name: 'Prerequisites Auto-Population',
      description: 'Should use conversation state for missing args',
      payload: createVapiPayload('book_appointment', {
        selectedTime: '2:00 PM'
        // Other fields should be populated from conversation state
      })
    }
  ];
  
  const results = [];
  
  for (const test of flowTests) {
    console.log(`\n🔄 Testing: ${test.name}`);
    console.log(`   Description: ${test.description}`);
    
    const result = await makeToolCallRequest(test.payload);
    
    results.push({
      testName: test.name,
      success: result.success,
      hasFlowGuidance: result.data?.error_code === 'FLOW_INTERCEPTION',
      hasPrerequisiteGuidance: result.data?.error_code === 'PREREQUISITE_MISSING',
      guidanceMessage: result.data?.message_to_patient,
      errorCode: result.data?.error_code
    });
    
    console.log(`   🔄 Flow Interception: ${result.data?.error_code === 'FLOW_INTERCEPTION' ? 'Yes' : 'No'}`);
    console.log(`   🔄 Guidance: ${result.data?.message_to_patient || 'None'}`);
  }
  
  return results;
}

/**
 * Generate comprehensive test report
 */
function generateTestReport(errorResults, performanceResults, flowResults) {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 4 COMPREHENSIVE TEST REPORT');
  console.log('='.repeat(60));
  
  // Error Recovery Results
  console.log('\n📋 ERROR RECOVERY RESULTS:');
  errorResults.forEach(result => {
    console.log(`\n  ${result.testName}:`);
    console.log(`    ✅ User-Friendly Message: ${result.hasUserFriendlyMessage ? 'Yes' : 'No'}`);
    console.log(`    ✅ Response Time: ${result.responseTime}ms`);
    console.log(`    ✅ Error Code: ${result.errorCode || 'None'}`);
    if (result.message) {
      console.log(`    ✅ Message: "${result.message}"`);
    }
  });
  
  // Performance Results
  console.log('\n⚡ PERFORMANCE RESULTS:');
  performanceResults.forEach(result => {
    console.log(`\n  ${result.testName}:`);
    console.log(`    ⚡ Average Response: ${result.averageResponseTime.toFixed(2)}ms`);
    console.log(`    ⚡ Performance: ${result.averageResponseTime < 1000 ? 'EXCELLENT' : result.averageResponseTime < 2000 ? 'GOOD' : 'NEEDS IMPROVEMENT'}`);
  });
  
  // Flow Orchestration Results
  console.log('\n🔄 FLOW ORCHESTRATION RESULTS:');
  flowResults.forEach(result => {
    console.log(`\n  ${result.testName}:`);
    console.log(`    🔄 Flow Management: ${result.hasFlowGuidance || result.hasPrerequisiteGuidance ? 'Working' : 'Needs Review'}`);
    console.log(`    🔄 Error Code: ${result.errorCode || 'None'}`);
    if (result.guidanceMessage) {
      console.log(`    🔄 Guidance: "${result.guidanceMessage}"`);
    }
  });
  
  // Overall Assessment
  console.log('\n🎯 OVERALL ASSESSMENT:');
  const totalErrorTests = errorResults.length;
  const successfulErrorRecovery = errorResults.filter(r => r.hasUserFriendlyMessage).length;
  
  const avgPerformance = performanceResults.reduce((sum, r) => sum + r.averageResponseTime, 0) / performanceResults.length;
  const performanceGrade = avgPerformance < 1000 ? 'A' : avgPerformance < 1500 ? 'B' : avgPerformance < 2000 ? 'C' : 'D';
  
  const flowManagementWorking = flowResults.filter(r => r.hasFlowGuidance || r.hasPrerequisiteGuidance).length;
  
  console.log(`  📊 Error Recovery: ${successfulErrorRecovery}/${totalErrorTests} (${((successfulErrorRecovery/totalErrorTests)*100).toFixed(1)}%)`);
  console.log(`  📊 Average Performance: ${avgPerformance.toFixed(2)}ms (Grade: ${performanceGrade})`);
  console.log(`  📊 Flow Management: ${flowManagementWorking}/${flowResults.length} scenarios handled`);
  
  console.log('\n✨ PHASE 4 REFACTOR STATUS: ');
  if (successfulErrorRecovery === totalErrorTests && performanceGrade <= 'B' && flowManagementWorking >= flowResults.length * 0.8) {
    console.log('  🎉 EXCELLENT - Phase 4 objectives achieved!');
  } else if (successfulErrorRecovery >= totalErrorTests * 0.8 && performanceGrade <= 'C') {
    console.log('  ✅ GOOD - Phase 4 mostly successful, minor improvements possible');
  } else {
    console.log('  ⚠️  NEEDS WORK - Some Phase 4 objectives require attention');
  }
}

/**
 * Main test execution
 */
async function runComprehensiveTests() {
  try {
    console.log('🚀 Starting Phase 4 Comprehensive Testing...');
    console.log(`📍 Testing endpoint: ${VAPI_TOOL_CALLS_ENDPOINT}`);
    
    // Run all test suites
    const errorResults = await testErrorRecoveryScenarios();
    const performanceResults = await testPerformanceOptimizations();
    const flowResults = await testFlowOrchestration();
    
    // Generate comprehensive report
    generateTestReport(errorResults, performanceResults, flowResults);
    
    console.log('\n🏁 Testing complete!');
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveTests();
}

export { runComprehensiveTests, TEST_SCENARIOS }; 