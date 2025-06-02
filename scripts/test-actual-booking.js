#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

console.log('🧪 Live NexHealth Booking Test');
console.log('==============================\n');

async function testLiveBooking() {
  try {
    // Import the actual booking tool
    const { default: bookAppointmentTool } = await import('../lib/tools/bookAppointment.js');
    const { PrismaClient } = require('@prisma/client');
    
    const prisma = new PrismaClient();
    
    console.log('📋 Loading practice configuration...');
    
    // Get practice data
    const practice = await prisma.practice.findFirst({
      where: { name: { contains: 'Royal Oak' } },
      include: { 
        appointmentTypes: true,
        savedProviders: { 
          where: { isActive: true },
          include: { provider: true }
        },
        savedOperatories: { 
          where: { isActive: true }
        }
      }
    });
    
    if (!practice) {
      throw new Error('Practice not found');
    }
    
    console.log(`✅ Practice: ${practice.name}`);
    console.log(`   Subdomain: ${practice.nexhealthSubdomain}`);
    console.log(`   Location ID: ${practice.nexhealthLocationId}`);
    console.log();
    
    // Test booking arguments (from our successful call)
    const testBookingArgs = {
      selectedTime: "8:00 AM",
      patientId: "379724872", // Bob Ross
      appointmentTypeId: "997003", // General Cleanup
      requestedDate: "2025-12-23",
      durationMinutes: 30
    };
    
    console.log('📝 Test Booking Arguments:');
    console.log(JSON.stringify(testBookingArgs, null, 2));
    console.log();
    
    // Create test context
    const context = {
      practice,
      vapiCallId: "test-call-" + Date.now(),
      toolCallId: "test-tool-call-" + Date.now(),
      assistantId: "test-assistant"
    };
    
    console.log('🚀 Executing booking tool...');
    console.log('⚠️  Note: This will create a REAL appointment!');
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
    
    // Give user time to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🔄 Proceeding with booking...\n');
    
    // Execute the booking tool
    const result = await bookAppointmentTool.run({
      args: testBookingArgs,
      context
    });
    
    console.log('📊 Booking Result:');
    console.log('================');
    console.log(`Success: ${result.success}`);
    console.log(`Message: ${result.message_to_patient}`);
    
    if (result.success && result.data) {
      console.log('\n🎉 Booking Details:');
      console.log(`   Appointment ID: ${result.data.appointment_id}`);
      console.log(`   Date: ${result.data.appointment_date}`);
      console.log(`   Time: ${result.data.appointment_time}`);
      console.log(`   Type: ${result.data.appointment_type}`);
      console.log(`   Provider: ${result.data.provider_name}`);
      console.log(`   Location: ${result.data.location_name}`);
    } else {
      console.log('\n❌ Booking Failed:');
      console.log(`   Error Code: ${result.error_code}`);
      console.log(`   Details: ${result.details}`);
    }
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('❌ Test Error:', error);
  }
}

// Warn about live booking
console.log('⚠️  WARNING: This will create a REAL appointment in NexHealth!');
console.log('   Only run this if you want to test live booking.');
console.log('   You may need to cancel the appointment afterwards.\n');

const args = process.argv.slice(2);
if (args.includes('--live')) {
  testLiveBooking();
} else {
  console.log('🛡️  Safety Mode: Add --live flag to run actual booking test');
  console.log('   Example: node scripts/test-actual-booking.js --live');
  console.log('\n📝 What this test would do:');
  console.log('   1. Load Royal Oak Family Dental practice config');
  console.log('   2. Create booking for Bob Ross (patient 379724872)');
  console.log('   3. General Cleanup appointment on 2025-12-23 at 8:00 AM');
  console.log('   4. Use provider 377851144 and operatory 159815');
  console.log('   5. Send actual POST request to NexHealth API');
  console.log('   6. Create real appointment if successful');
} 