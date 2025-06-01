#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function getNexHealthBearerToken() {
  const authHeader = process.env.NEXHEALTH_API_KEY;
  
  console.log('🔑 Getting NexHealth bearer token...');
  console.log('Auth header:', authHeader ? `${authHeader.substring(0, 20)}...` : 'NOT SET');
  
  if (!authHeader) {
    console.error('❌ NEXHEALTH_API_KEY environment variable not set');
    return null;
  }
  
  try {
    const response = await fetch('https://nexhealth.info/authenticates', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.Nexhealth+json;version=2',
        'Authorization': authHeader
      }
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Auth failed:', response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    console.log('Auth response:', data);
    
    const bearerToken = data.access_token || data.data?.token;
    if (!bearerToken) {
      console.error('❌ No token found in response:', data);
      return null;
    }
    
    console.log('✅ Got bearer token:', bearerToken.substring(0, 20) + '...');
    return bearerToken;
    
  } catch (error) {
    console.error('❌ Error getting bearer token:', error);
    return null;
  }
}

async function testAppointmentSlots(bearerToken, testParams = {}) {
  const params = {
    subdomain: 'xyz',
    start_date: '2025-12-23',
    days: 1,
    'lids[]': '318534',
    'pids[]': '377851144',
    appointment_type_id: '1001465', // Using the ID from your curl command
    ...testParams
  };
  
  // Build query string
  const queryString = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  
  const url = `https://nexhealth.info/appointment_slots?${queryString}`;
  
  console.log('\n🔍 Testing appointment slots API:');
  console.log('URL:', url);
  console.log('Parameters:', params);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.Nexhealth+json;version=2',
        'Authorization': `Bearer ${bearerToken}`
      }
    });
    
    if (!response.ok) {
      console.error('❌ API request failed:', response.status, await response.text());
      return null;
    }
    
    const data = await response.json();
    console.log('\n✅ API Response:');
    console.log(JSON.stringify(data, null, 2));
    
    return data;
    
  } catch (error) {
    console.error('❌ Error calling appointment slots API:', error);
    return null;
  }
}

async function testDifferentAppointmentTypes(bearerToken) {
  console.log('\n🧪 Testing different appointment type IDs:');
  
  const appointmentTypeIds = [
    '997003', // From the logs (General Cleanup)
    '1001465', // From your curl command
    '997002'  // Let's try another one
  ];
  
  for (const typeId of appointmentTypeIds) {
    console.log(`\n--- Testing appointment type ID: ${typeId} ---`);
    await testAppointmentSlots(bearerToken, { appointment_type_id: typeId });
  }
}

async function simulateUserRequest() {
  console.log('\n🎭 Simulating user request: "Can I come in on December 23 2025?"');
  console.log('Expected flow:');
  console.log('1. User says: "December 23 2025"');
  console.log('2. Date gets parsed to: "2025-12-23"');
  console.log('3. Previous tool call found appointment type ID: "997003" (General Cleanup)');
  console.log('4. We should check availability for that combination');
  
  const bearerToken = await getNexHealthBearerToken();
  if (!bearerToken) {
    console.error('❌ Cannot proceed without bearer token');
    return;
  }
  
  // Test the exact scenario from the logs
  console.log('\n📋 Testing exact scenario from logs:');
  const result = await testAppointmentSlots(bearerToken, {
    appointment_type_id: '997003',
    start_date: '2025-12-23'
  });
  
  if (result) {
    console.log('\n📊 Analysis:');
    if (result.data && result.data.length > 0) {
      const locationData = result.data[0];
      console.log(`- Location ID: ${locationData.lid}`);
      console.log(`- Provider ID: ${locationData.pid}`);
      console.log(`- Available slots: ${locationData.slots?.length || 0}`);
      console.log(`- Next available date: ${locationData.next_available_date || 'None'}`);
      
      if (locationData.slots && locationData.slots.length > 0) {
        console.log('🎉 Found available slots!');
        locationData.slots.forEach((slot, index) => {
          console.log(`  ${index + 1}. ${slot.start_time} - ${slot.end_time}`);
        });
      } else {
        console.log('❌ No slots available for this date');
        console.log('💡 Suggestions:');
        console.log('  - Check if provider has availability set up for that date');
        console.log('  - Verify the appointment type is correct');
        console.log('  - Try a different date closer to current date');
      }
    }
  }
}

async function main() {
  console.log('🚀 NexHealth Appointment Slots Debugger');
  console.log('=====================================\n');
  
  const bearerToken = await getNexHealthBearerToken();
  if (!bearerToken) {
    console.error('❌ Cannot proceed without bearer token');
    return;
  }
  
  // Test the basic scenario
  await testAppointmentSlots(bearerToken);
  
  // Test different appointment types
  await testDifferentAppointmentTypes(bearerToken);
  
  // Simulate the user scenario
  await simulateUserRequest();
  
  console.log('\n🔍 Next steps:');
  console.log('1. Compare these results with lib/tools/checkAvailableSlots.ts');
  console.log('2. Check if appointment type IDs match');
  console.log('3. Verify provider availability configuration');
  console.log('4. Test with dates closer to current date');
}

main().catch(console.error); 