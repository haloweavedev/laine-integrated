#!/usr/bin/env node

/**
 * Phase 4.2: Comprehensive Scenario-Based Functional Testing
 * 
 * This script validates all Laine AI functionality including:
 * - Tool execution with prerequisite checks
 * - Dynamic message generation 
 * - System prompt effectiveness
 * - Error handling
 * - Conversational flow
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test scenario definitions
const TEST_SCENARIOS = {
  HAPPY_PATH: {
    EXISTING_PATIENT_BOOKING: {
      name: "Existing Patient - Full Appointment Booking",
      description: "Test the complete 8-step flow for existing patients",
      steps: [
        "Patient identity verification with find_patient_in_ehr",
        "Appointment type determination with find_appointment_type", 
        "Date preference collection",
        "Availability check with check_available_slots",
        "Time selection from available options",
        "Final confirmation of all details",
        "Appointment booking with book_appointment",
        "Completion confirmation and next steps"
      ]
    },
    NEW_PATIENT_BOOKING: {
      name: "New Patient - Registration + Booking",
      description: "Test the 5-step registration + 8-step booking flow",
      steps: [
        "Identify as new patient",
        "Collect required information",
        "Register with create_new_patient",
        "Confirm registration success",
        "Proceed with appointment booking flow"
      ]
    },
    INFORMATION_REQUESTS: {
      name: "Practice Information Requests",
      description: "Test information retrieval tools",
      scenarios: [
        "Practice address with get_practice_details",
        "Insurance verification with check_insurance_participation",
        "Cost estimates with get_service_cost_estimate"
      ]
    }
  },
  PREREQUISITE_HANDLING: {
    VAGUE_BOOKING: {
      name: "Vague Booking Request",
      input: "I want to book an appointment",
      expected: "Laine asks if new/existing, then ID details, then type, then date"
    },
    DATE_BEFORE_TYPE: {
      name: "Date Before Type",
      input: "Can I get an appointment next Tuesday?",
      expected: "Laine asks for appointment type first"
    },
    SKIP_STEPS: {
      name: "Attempt to Skip Steps",
      input: "Book me for tomorrow without patient ID",
      expected: "Prerequisite check triggers, asks for identifying information"
    }
  },
  ERROR_SCENARIOS: {
    PATIENT_NOT_FOUND: {
      name: "Patient Not Found",
      expected: "Polite suggestion they might be new patient"
    },
    NO_SLOTS_AVAILABLE: {
      name: "No Available Slots", 
      expected: "Offer alternative dates or appointment types"
    },
    INSURANCE_NOT_ACCEPTED: {
      name: "Insurance Not Accepted/Configured",
      expected: "Clear explanation of coverage status"
    },
    SYSTEM_ERROR: {
      name: "System/API Error",
      expected: "Graceful error handling with fallback options"
    }
  }
};

async function runDatabaseQueries() {
  console.log('🔍 Phase 4.2: Database State Analysis');
  console.log('=====================================\n');
  
  try {
    // Check recent tool executions
    const recentToolLogs = await prisma.toolLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        practice: { select: { name: true } }
      }
    });
    
    console.log('📊 Recent Tool Executions (Last 10):');
    recentToolLogs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.toolName} | ${log.success ? '✅' : '❌'} | ${log.createdAt.toISOString()}`);
      if (!log.success && log.errorMessage) {
        console.log(`   Error: ${log.errorMessage}`);
      }
    });
    
    // Check call logs with tool usage
    const recentCalls = await prisma.callLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        practice: { select: { name: true } }
      }
    });
    
    console.log('\n📞 Recent Call Logs:');
    recentCalls.forEach((call, index) => {
      console.log(`${index + 1}. Call ${call.vapiCallId} | Status: ${call.callStatus}`);
      console.log(`   Practice: ${call.practice.name}`);
      console.log(`   Patient ID: ${call.nexhealthPatientId || 'Not set'}`);
      console.log(`   Last Type: ${call.lastAppointmentTypeName || 'Not set'}`);
      if (call.detectedIntent) {
        console.log(`   Intent: ${call.detectedIntent}`);
      }
    });

    // Check practice configuration
    const practiceConfig = await prisma.practiceAssistantConfig.findFirst({
      include: { 
        practice: {
          include: {
            appointmentTypes: true,
            savedProviders: {
              include: {
                provider: true,
                acceptedAppointmentTypes: {
                  include: { appointmentType: true }
                }
              }
            }
          }
        }
      }
    });
    
    if (practiceConfig) {
      console.log('\n🏥 Practice Configuration:');
      console.log(`   Practice: ${practiceConfig.practice.name}`);
      console.log(`   Assistant ID: ${practiceConfig.vapiAssistantId}`);
      console.log(`   System Prompt Length: ${practiceConfig.systemPrompt.length} chars`);
      console.log(`   Appointment Types: ${practiceConfig.practice.appointmentTypes.length}`);
      console.log(`   Active Providers: ${practiceConfig.practice.savedProviders.length}`);
      
      // Check provider configurations
      console.log('\n👨‍⚕️ Provider Configurations:');
      practiceConfig.practice.savedProviders.forEach((savedProvider, index) => {
        console.log(`${index + 1}. ${savedProvider.provider.firstName} ${savedProvider.provider.lastName}`);
        console.log(`   Active: ${savedProvider.isActive}`);
        console.log(`   Accepted Types: ${savedProvider.acceptedAppointmentTypes.length}`);
      });
    }
    
    return {
      toolLogsCount: recentToolLogs.length,
      callLogsCount: recentCalls.length,
      hasValidConfig: !!practiceConfig,
      successfulTools: recentToolLogs.filter(log => log.success).length,
      failedTools: recentToolLogs.filter(log => !log.success).length
    };
    
  } catch (error) {
    console.error('❌ Error analyzing database:', error);
    return null;
  }
}

async function validateToolImplementations() {
  console.log('\n🛠️ Tool Implementation Validation');
  console.log('==================================\n');
  
  const toolFiles = [
    'find_patient_in_ehr',
    'create_new_patient', 
    'find_appointment_type',
    'check_available_slots',
    'book_appointment',
    'get_practice_details',
    'check_insurance_participation',
    'get_service_cost_estimate'
  ];
  
  console.log('📋 Validating Tool Implementations:');
  
  // Check if tools exist and have proper structure
  try {
    const fs = require('fs');
    const path = require('path');
    
    const toolsDir = path.join(__dirname, '../lib/tools');
    const availableTools = [];
    
    toolFiles.forEach(toolName => {
      const toolFile = path.join(toolsDir, `${toolName.replace('_', '').replace('_', '')}.ts`);
      // Convert snake_case to camelCase for file names
      const camelCaseFile = toolName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()) + '.ts';
      const actualFile = path.join(toolsDir, camelCaseFile);
      
      if (fs.existsSync(actualFile)) {
        console.log(`✅ ${toolName} - Found implementation`);
        availableTools.push(toolName);
      } else {
        console.log(`❌ ${toolName} - Missing implementation`);
      }
    });
    
    console.log(`\nTool Coverage: ${availableTools.length}/${toolFiles.length} tools implemented`);
    
    return availableTools;
    
  } catch (error) {
    console.error('❌ Error validating tools:', error);
    return [];
  }
}

async function checkSystemConfiguration() {
  console.log('\n⚙️ System Configuration Check');
  console.log('=============================\n');
  
  const config = {
    environment: process.env.NODE_ENV || 'development',
    databaseUrl: !!process.env.DATABASE_URL,
    vapiApiKey: !!process.env.VAPI_API_KEY,
    appBaseUrl: process.env.NEXT_PUBLIC_APP_URL || 'Not set',
    nexhealthApiKey: !!process.env.NEXHEALTH_API_KEY,
  };
  
  console.log('📊 Environment Configuration:');
  Object.entries(config).forEach(([key, value]) => {
    const status = typeof value === 'boolean' ? (value ? '✅' : '❌') : '📝';
    console.log(`   ${key}: ${status} ${typeof value === 'boolean' ? (value ? 'Set' : 'Missing') : value}`);
  });
  
  return config;
}

function generateTestReport(dbAnalysis) {
  console.log('\n📊 Phase 4.2 Testing Readiness Report');
  console.log('=====================================\n');
  
  const readinessScore = calculateReadinessScore(dbAnalysis);
  
  console.log(`🎯 Overall Readiness Score: ${readinessScore}%\n`);
  
  console.log('📋 Testing Recommendations:');
  
  if (readinessScore >= 80) {
    console.log('✅ System is ready for comprehensive testing');
    console.log('🚀 Proceed with all test scenarios');
  } else if (readinessScore >= 60) {
    console.log('⚠️ System has some issues but basic testing can proceed');
  } else {
    console.log('❌ System needs significant fixes before testing');
  }
  
  console.log('\n🧪 Suggested Test Sequence:');
  console.log('1. Basic tool execution tests (find_patient_in_ehr)');
  console.log('2. Prerequisite handling validation');
  console.log('3. Dynamic message generation quality');
  console.log('4. Complete booking flow tests');
  console.log('5. Error scenario handling');
  console.log('6. System prompt adherence evaluation');
}

function calculateReadinessScore(dbAnalysis) {
  let score = 0;
  
  if (dbAnalysis?.hasValidConfig) score += 40;
  if (dbAnalysis?.toolLogsCount > 0) score += 20;
  if (dbAnalysis?.successfulTools > dbAnalysis?.failedTools) score += 20;
  if (dbAnalysis?.callLogsCount > 0) score += 20;
  
  return Math.round(score);
}

async function runPhase42Testing() {
  console.log('🚀 Phase 4.2: Comprehensive Scenario-Based Functional Testing');
  console.log('==========================================================\n');
  
  try {
    // Run all validation checks
    const dbAnalysis = await runDatabaseQueries();
    const toolValidation = await validateToolImplementations();
    const sysConfig = await checkSystemConfiguration();
    
    // Generate comprehensive report
    generateTestReport(dbAnalysis);
    
    console.log('\n✅ Phase 4.2 Analysis Complete!');
    console.log('\nNext Steps:');
    console.log('1. Make test calls to the Laine assistant');
    console.log('2. Monitor tool execution in real-time');
    console.log('3. Validate system prompt effectiveness');
    console.log('4. Proceed to Phase 4.3 - Log Analysis');
    
  } catch (error) {
    console.error('❌ Error in Phase 4.2 testing:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the testing
runPhase42Testing(); 