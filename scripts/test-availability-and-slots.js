const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

const NEXHEALTH_API_BASE_URL = process.env.NEXHEALTH_API_BASE_URL || 'https://nexhealth.info';
const MASTER_NEXHEALTH_API_KEY = process.env.NEXHEALTH_API_KEY;
const TOKEN_CACHE_ID = "singleton";

// Test configuration
const TEST_CONFIG = {
  practiceSubdomain: 'xyz',
  testDate: '2025-12-22', // Use tomorrow to avoid conflicts
  testDays: ['Tuesday'], // Dec 24, 2025 is a Tuesday
  testBeginTime: '09:00',
  testEndTime: '17:00',
  testProviderNexhealthId: '377851144',
  testOperatoryNexhealthId: '159815'
};

// Get bearer token (simplified version from lib/nexhealth.ts)
async function getNexhealthBearerToken() {
  try {
    // Check cache first
    const cachedToken = await prisma.nexhealthTokenCache.findUnique({
      where: { id: TOKEN_CACHE_ID }
    });

    if (cachedToken && cachedToken.expiresAt > new Date()) {
      return cachedToken.accessToken;
    }

    // Fetch new token
    const authUrl = `${NEXHEALTH_API_BASE_URL}/authenticates`;
    console.log("📡 Fetching new NexHealth bearer token...");

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.Nexhealth+json;version=2',
        'Authorization': MASTER_NEXHEALTH_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`NexHealth Authentication failed: ${response.status} - ${errorBody}`);
    }

    const result = await response.json();
    const accessToken = result.data.token;
    const expiresAt = new Date(Date.now() + 55 * 60 * 1000); // 55 minutes

    // Cache the token
    await prisma.nexhealthTokenCache.upsert({
      where: { id: TOKEN_CACHE_ID },
      create: {
        id: TOKEN_CACHE_ID,
        accessToken,
        expiresAt,
      },
      update: {
        accessToken,
        expiresAt,
      },
    });

    return accessToken;
  } catch (error) {
    console.error('❌ Error getting bearer token:', error);
    throw error;
  }
}

// Call NexHealth API with proper authentication
async function callNexhealthAPI(path, subdomain, params = {}, method = 'GET', body = null) {
  const bearerToken = await getNexhealthBearerToken();
  
  const url = new URL(`${NEXHEALTH_API_BASE_URL}${path}`);
  
  // Add subdomain and other params
  url.searchParams.append('subdomain', subdomain);
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => url.searchParams.append(key, v.toString()));
    } else {
      url.searchParams.append(key, value.toString());
    }
  });

  const options = {
    method,
    headers: {
      'Accept': 'application/vnd.Nexhealth+json;version=2',
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  console.log(`🔗 NexHealth API: ${method} ${url.toString()}`);
  if (body) {
    console.log('📤 Request body:', JSON.stringify(body, null, 2));
  }

  const response = await fetch(url.toString(), options);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ NexHealth API error (${response.status}):`, errorText);
    throw new Error(`NexHealth API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log('📥 Response:', JSON.stringify(data, null, 2));
  return data;
}

// Test class to organize our testing
class AvailabilitySlotTester {
  constructor() {
    this.practice = null;
    this.testProvider = null;
    this.testOperatory = null;
    this.createdAvailabilityId = null;
    this.testResults = {
      setup: false,
      createAvailability: false,
      verifyInNexHealth: false,
      checkSlotsWithoutType: false,
      checkSlotsWithType: false,
      cleanup: false
    };
  }

  log(message, type = 'info') {
    const icons = {
      info: '📋',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    };
    console.log(`${icons[type]} [${new Date().toISOString()}] ${message}`);
  }

  async setupTestData() {
    this.log('Setting up test data...', 'info');
    
    try {
      // Find practice
      this.practice = await prisma.practice.findFirst({
        where: { nexhealthSubdomain: TEST_CONFIG.practiceSubdomain },
        include: {
          appointmentTypes: true,
          providers: true,
          savedOperatories: { where: { isActive: true } }
        }
      });

      if (!this.practice) {
        throw new Error(`Practice with subdomain "${TEST_CONFIG.practiceSubdomain}" not found`);
      }

      // Find test provider
      this.testProvider = this.practice.providers.find(
        p => p.nexhealthProviderId === TEST_CONFIG.testProviderNexhealthId
      );

      if (!this.testProvider) {
        throw new Error(`Provider with NexHealth ID ${TEST_CONFIG.testProviderNexhealthId} not found`);
      }

      // Find test operatory
      this.testOperatory = this.practice.savedOperatories.find(
        o => o.nexhealthOperatoryId === TEST_CONFIG.testOperatoryNexhealthId
      );

      if (!this.testOperatory) {
        throw new Error(`Operatory with NexHealth ID ${TEST_CONFIG.testOperatoryNexhealthId} not found`);
      }

      if (this.practice.appointmentTypes.length === 0) {
        throw new Error('No appointment types found for practice');
      }

      this.log(`Practice: ${this.practice.name}`, 'success');
      this.log(`Provider: ${this.testProvider.firstName} ${this.testProvider.lastName}`, 'success');
      this.log(`Operatory: ${this.testOperatory.name}`, 'success');
      this.log(`Appointment Types: ${this.practice.appointmentTypes.length} types available`, 'success');
      
      this.testResults.setup = true;
      return true;
    } catch (error) {
      this.log(`Setup failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async testCheckSlots() {
    this.log('Testing appointment slot checking...', 'info');
    
    try {
      // Test with the first appointment type
      const testAppointmentType = this.practice.appointmentTypes[0];
      
      const response = await callNexhealthAPI(
        '/appointment_slots',
        this.practice.nexhealthSubdomain,
        {
          start_date: TEST_CONFIG.testDate,
          days: '1',
          'lids[]': this.practice.nexhealthLocationId,
          'pids[]': TEST_CONFIG.testProviderNexhealthId,
          'operatory_ids[]': TEST_CONFIG.testOperatoryNexhealthId,
          appointment_type_id: testAppointmentType.nexhealthAppointmentTypeId,
          overlapping_operatory_slots: 'false'
        }
      );

      const slotsCount = response.data?.[0]?.slots?.length || 0;
      this.log(`Slots found with type ${testAppointmentType.nexhealthAppointmentTypeId}: ${slotsCount}`, slotsCount > 0 ? 'success' : 'warning');
      
      this.testResults.checkSlotsWithType = true;
      return response;
    } catch (error) {
      this.log(`Slot check failed: ${error.message}`, 'error');
      throw error;
    }
  }

  generateReport() {
    this.log('\n📊 TEST RESULTS SUMMARY', 'info');
    this.log('='.repeat(50), 'info');
    
    const tests = [
      { name: 'Setup Test Data', result: this.testResults.setup },
      { name: 'Check Appointment Slots', result: this.testResults.checkSlotsWithType }
    ];

    tests.forEach(test => {
      const status = test.result ? '✅ PASSED' : '❌ FAILED';
      this.log(`${test.name}: ${status}`, test.result ? 'success' : 'error');
    });

    const passedCount = tests.filter(t => t.result).length;
    const totalCount = tests.length;
    
    this.log(`\nOverall: ${passedCount}/${totalCount} tests passed`, passedCount === totalCount ? 'success' : 'warning');
    
    if (passedCount === totalCount) {
      this.log('🎉 Tests completed successfully!', 'success');
    } else {
      this.log('⚠️ Some tests failed. Please check the implementation.', 'warning');
    }
  }

  async run() {
    this.log('🚀 Starting Availability & Slot Checking Tests', 'info');
    
    try {
      await this.setupTestData();
      await this.testCheckSlots();
    } catch (error) {
      this.log(`Test execution failed: ${error.message}`, 'error');
    } finally {
      this.generateReport();
      await prisma.$disconnect();
    }
  }
}

// Main execution
async function main() {
  const tester = new AvailabilitySlotTester();
  await tester.run();
}

if (require.main === module) {
  console.log('🚀 Starting availability and slot testing...\n');
  main().catch(console.error);
} 