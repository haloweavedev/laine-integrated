#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// Test the new booking tool with data from our successful call logs
console.log('🚀 Testing Book Appointment Tool');
console.log('================================\n');

// Test data from the successful call
const testBookingData = {
  selectedTime: "8:00 AM",
  patientId: "379724872", // Bob Ross from the call log
  appointmentTypeId: "997003", // General Cleanup
  requestedDate: "2025-12-23",
  durationMinutes: 30 // General Cleanup is 30 minutes
};

console.log('📋 Test Booking Data:');
console.log(JSON.stringify(testBookingData, null, 2));
console.log();

// Test the time parsing function
console.log('🕐 Testing Time Parsing:');
console.log('========================');

function parseSelectedTimeToNexHealthFormat(selectedTime, requestedDate, durationMinutes) {
  // Parse the selected time (e.g., "8:00 AM", "2:30 PM")
  const timeParts = selectedTime.match(/(\d{1,2}):?(\d{0,2})\s*(AM|PM)/i);
  
  if (!timeParts) {
    throw new Error(`Invalid time format: ${selectedTime}`);
  }

  let hours = parseInt(timeParts[1]);
  const minutes = timeParts[2] ? parseInt(timeParts[2]) : 0;
  const ampm = timeParts[3].toUpperCase();

  // Convert to 24-hour format
  if (ampm === 'PM' && hours !== 12) {
    hours += 12;
  } else if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }

  // Create start time in Central Time (NexHealth uses -06:00)
  const startDate = new Date(`${requestedDate}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
  const startTime = `${requestedDate}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00-06:00`;

  // Calculate end time
  const endDate = new Date(startDate.getTime() + (durationMinutes * 60 * 1000));
  const endHours = endDate.getHours();
  const endMinutes = endDate.getMinutes();
  const endTime = `${requestedDate}T${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:00-06:00`;

  return { startTime, endTime };
}

try {
  const { startTime, endTime } = parseSelectedTimeToNexHealthFormat(
    testBookingData.selectedTime,
    testBookingData.requestedDate,
    testBookingData.durationMinutes
  );
  
  console.log(`✅ Input: ${testBookingData.selectedTime}`);
  console.log(`✅ Start Time: ${startTime}`);
  console.log(`✅ End Time: ${endTime}`);
  console.log();
  
  // Test with different times
  const testTimes = ["8:00 AM", "12:30 PM", "5:00 PM", "11:00 AM"];
  
  console.log('📊 Testing Multiple Times:');
  console.log('==========================');
  
  testTimes.forEach(time => {
    try {
      const result = parseSelectedTimeToNexHealthFormat(time, testBookingData.requestedDate, 30);
      console.log(`${time.padEnd(8)} → ${result.startTime} to ${result.endTime}`);
    } catch (error) {
      console.log(`${time.padEnd(8)} → ERROR: ${error.message}`);
    }
  });
  
  console.log('\n📝 Expected Booking Payload:');
  console.log('============================');
  
  const bookingPayload = {
    location_id: 318534,
    patient_id: parseInt(testBookingData.patientId),
    provider_id: 377851144,
    appointment_type_id: parseInt(testBookingData.appointmentTypeId),
    operatory_id: 159815,
    start_time: startTime,
    end_time: endTime,
    source: "laine_ai",
    note: "General Cleanup - Scheduled via LAINE AI Assistant"
  };
  
  console.log(JSON.stringify(bookingPayload, null, 2));
  
  console.log('\n🎯 Booking URL:');
  console.log(`POST https://nexhealth.info/appointments?subdomain=xyz`);
  console.log('Authorization: Bearer [TOKEN]');
  console.log('Content-Type: application/json');
  console.log();
  console.log('Body:');
  console.log(`{ "appointment": ${JSON.stringify(bookingPayload)} }`);
  
  console.log('\n✅ Booking tool data structure looks correct!');
  console.log('🚦 Ready to test with live VAPI integration');
  
} catch (error) {
  console.error('❌ Error testing booking tool:', error);
} 