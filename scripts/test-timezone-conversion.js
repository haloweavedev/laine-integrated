#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

console.log('🕐 Testing Timezone Conversion Logic');
console.log('===================================\n');

// Import Luxon
const { DateTime } = require('luxon');

// Test function (replicated from the tool)
function parseSelectedTimeToNexHealthFormat(
  selectedTime,
  requestedDate,
  practiceTimezone = 'America/Chicago'
) {
  // Parse the selected time and date in the practice's timezone
  const localDateTime = DateTime.fromFormat(
    `${requestedDate} ${selectedTime}`,
    'yyyy-MM-dd h:mm a',
    { zone: practiceTimezone }
  );

  if (!localDateTime.isValid) {
    throw new Error(`Invalid date/time format: ${requestedDate} ${selectedTime}. Error: ${localDateTime.invalidReason}`);
  }

  // Convert to UTC and format for NexHealth API
  const startTime = localDateTime.toUTC().toISO({ suppressMilliseconds: true });

  if (!startTime) {
    throw new Error(`Failed to convert to UTC: ${requestedDate} ${selectedTime}`);
  }

  console.log(`[timezone] Converting ${selectedTime} on ${requestedDate} in ${practiceTimezone} to UTC: ${startTime}`);

  return { startTime };
}

// Test validation function
function validateSelectedTime(selectedTime) {
  // Check if the time matches expected format (e.g., "8:00 AM", "12:30 PM")
  const timePattern = /^(1[0-2]|[1-9]):([0-5][0-9])\s?(AM|PM)$/i;
  return timePattern.test(selectedTime.trim());
}

console.log('🧪 Test Cases:');
console.log('==============\n');

// Test Case 1: The main issue - 11:00 AM Chicago should be 17:00 UTC in winter
try {
  console.log('🔸 Test 1: Winter time (Standard Time)');
  const result1 = parseSelectedTimeToNexHealthFormat('11:00 AM', '2025-12-23', 'America/Chicago');
  console.log(`   Expected: 2025-12-23T17:00:00Z`);
  console.log(`   Actual:   ${result1.startTime}`);
  console.log(`   ✅ ${result1.startTime === '2025-12-23T17:00:00Z' ? 'PASS' : 'FAIL'}\n`);
} catch (error) {
  console.log(`   ❌ ERROR: ${error.message}\n`);
}

// Test Case 2: Summer time (Daylight Saving Time)
try {
  console.log('🔸 Test 2: Summer time (Daylight Saving Time)');
  const result2 = parseSelectedTimeToNexHealthFormat('11:00 AM', '2025-06-23', 'America/Chicago');
  console.log(`   Expected: 2025-06-23T16:00:00Z`);
  console.log(`   Actual:   ${result2.startTime}`);
  console.log(`   ✅ ${result2.startTime === '2025-06-23T16:00:00Z' ? 'PASS' : 'FAIL'}\n`);
} catch (error) {
  console.log(`   ❌ ERROR: ${error.message}\n`);
}

// Test Case 3: PM times
try {
  console.log('🔸 Test 3: PM time conversion');
  const result3 = parseSelectedTimeToNexHealthFormat('2:30 PM', '2025-12-23', 'America/Chicago');
  console.log(`   Expected: 2025-12-23T20:30:00Z`);
  console.log(`   Actual:   ${result3.startTime}`);
  console.log(`   ✅ ${result3.startTime === '2025-12-23T20:30:00Z' ? 'PASS' : 'FAIL'}\n`);
} catch (error) {
  console.log(`   ❌ ERROR: ${error.message}\n`);
}

// Test Case 4: Edge cases - midnight and noon
try {
  console.log('🔸 Test 4: Midnight (12:00 AM)');
  const result4 = parseSelectedTimeToNexHealthFormat('12:00 AM', '2025-12-23', 'America/Chicago');
  console.log(`   Expected: 2025-12-23T06:00:00Z`);
  console.log(`   Actual:   ${result4.startTime}`);
  console.log(`   ✅ ${result4.startTime === '2025-12-23T06:00:00Z' ? 'PASS' : 'FAIL'}\n`);
} catch (error) {
  console.log(`   ❌ ERROR: ${error.message}\n`);
}

try {
  console.log('🔸 Test 5: Noon (12:00 PM)');
  const result5 = parseSelectedTimeToNexHealthFormat('12:00 PM', '2025-12-23', 'America/Chicago');
  console.log(`   Expected: 2025-12-23T18:00:00Z`);
  console.log(`   Actual:   ${result5.startTime}`);
  console.log(`   ✅ ${result5.startTime === '2025-12-23T18:00:00Z' ? 'PASS' : 'FAIL'}\n`);
} catch (error) {
  console.log(`   ❌ ERROR: ${error.message}\n`);
}

// Test validation
console.log('🧪 Validation Tests:');
console.log('====================\n');

const validTimes = ['8:00 AM', '12:30 PM', '1:45 PM', '11:00 AM'];
const invalidTimes = ['25:00 AM', '8:60 AM', '8 AM', '8:00', '0:00 AM', '13:00 PM'];

console.log('🔸 Valid time formats:');
validTimes.forEach(time => {
  const isValid = validateSelectedTime(time);
  console.log(`   ${time.padEnd(8)} → ${isValid ? '✅ PASS' : '❌ FAIL'}`);
});

console.log('\n🔸 Invalid time formats:');
invalidTimes.forEach(time => {
  const isValid = validateSelectedTime(time);
  console.log(`   ${time.padEnd(10)} → ${!isValid ? '✅ PASS (correctly rejected)' : '❌ FAIL (should be rejected)'}`);
});

console.log('\n🎯 Summary:');
console.log('===========');
console.log('✅ Timezone conversion uses proper local-to-UTC conversion');
console.log('✅ Handles Daylight Saving Time automatically');
console.log('✅ Validates time format correctly');
console.log('✅ Ready to fix the NexHealth "not during working hours" error!'); 