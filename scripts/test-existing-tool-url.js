#!/usr/bin/env node

// Test how the existing tool builds URLs vs working URLs

function testURLBuilding() {
  console.log('🔧 Testing URL parameter building...\n');
  
  // Simulate the existing tool's URLSearchParams approach
  console.log('1. Existing tool approach (URLSearchParams):');
  const urlParams = new URLSearchParams();
  urlParams.append('subdomain', 'xyz');
  urlParams.append('start_date', '2025-12-23');
  urlParams.append('days', '1');
  urlParams.append('appointment_type_id', '997003');
  urlParams.append('lids[]', '318534');
  urlParams.append('pids[]', '377851144');
  urlParams.append('operatory_ids[]', '159815');
  
  // Convert to object (this is what the existing tool does)
  const searchParams = Object.fromEntries(urlParams.entries());
  console.log('SearchParams object:', searchParams);
  
  // Build query string manually
  const queryString1 = Object.entries(searchParams)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  console.log('Generated URL query:', queryString1);
  
  console.log('\n2. Working approach (from test script):');
  const params = {
    subdomain: 'xyz',
    start_date: '2025-12-23',
    days: 1,
    'lids[]': '318534',
    'pids[]': '377851144',
    appointment_type_id: '997003',
    'operatory_ids[]': '159815'
  };
  
  const queryString2 = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  console.log('Generated URL query:', queryString2);
  
  console.log('\n3. Analysis:');
  console.log('Same result?', queryString1 === queryString2);
  
  console.log('\n4. The real issue:');
  console.log('- Both URLs are correctly formatted');
  console.log('- The problem is appointment type 997003 has no availability');
  console.log('- Appointment type 1001465 has availability');
  console.log('- Need to either:');
  console.log('  a) Configure availability for 997003 (General Cleanup)');
  console.log('  b) Update appointment type matching logic');
}

testURLBuilding(); 