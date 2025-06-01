#!/usr/bin/env node

// Test the timezone fix for appointment slot display times
console.log('🔧 Testing Timezone Display Fix');
console.log('================================\n');

// Sample time from NexHealth API
const sampleTime = "2025-12-23T08:00:00.000-06:00";
console.log(`📥 Input time from NexHealth: ${sampleTime}`);

// Test the old way (without timezone specified)
const oldWay = new Date(sampleTime).toLocaleTimeString('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

// Test the new way (with timezone specified)
const newWay = new Date(sampleTime).toLocaleTimeString('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/Chicago'
});

console.log(`❌ Old display (wrong): ${oldWay}`);
console.log(`✅ New display (correct): ${newWay}`);
console.log();

// Test multiple times
const testTimes = [
  "2025-12-23T08:00:00.000-06:00", // 8:00 AM Central
  "2025-12-23T12:00:00.000-06:00", // 12:00 PM Central  
  "2025-12-23T17:00:00.000-06:00", // 5:00 PM Central
  "2025-12-23T19:00:00.000-06:00"  // 7:00 PM Central
];

console.log('📊 Multiple Time Test:');
console.log('====================');
testTimes.forEach((time, index) => {
  const oldDisplay = new Date(time).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  const newDisplay = new Date(time).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Chicago'
  });
  
  console.log(`${index + 1}. ${time}`);
  console.log(`   Old: ${oldDisplay} | New: ${newDisplay}`);
});

console.log('\n🎯 Expected Results:');
console.log('- 8:00 AM, 12:00 PM, 5:00 PM, 7:00 PM');
console.log('- These should match the "New" column above'); 