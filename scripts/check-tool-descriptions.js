#!/usr/bin/env node

/**
 * Script to check that all tool descriptions are under VAPI's 1000 character limit
 * Usage: node scripts/check-tool-descriptions.js
 */

const { buildVapiTools } = require('../lib/tools');

function checkToolDescriptions() {
  console.log('🔍 Checking Tool Description Lengths');
  console.log('=====================================\n');

  try {
    // Build the tools as they would be sent to VAPI
    const appBaseUrl = "https://laine-integrated.vercel.app";
    const tools = buildVapiTools(appBaseUrl);

    let allValid = true;
    const maxLength = 1000;

    tools.forEach((tool, index) => {
      const description = tool.function.description;
      const length = description.length;
      const status = length <= maxLength ? '✅' : '❌';
      
      console.log(`${status} ${tool.function.name}`);
      console.log(`   Length: ${length}/${maxLength} characters`);
      
      if (length > maxLength) {
        allValid = false;
        console.log(`   ⚠️ EXCEEDS LIMIT by ${length - maxLength} characters`);
        console.log(`   Description: ${description.substring(0, 100)}...`);
      }
      
      console.log();
    });

    console.log(`📊 Summary: ${tools.length} tools checked`);
    
    if (allValid) {
      console.log('🎉 All tool descriptions are within VAPI limits!');
    } else {
      console.log('❌ Some tool descriptions exceed the 1000 character limit and need to be shortened.');
    }

    return allValid;

  } catch (error) {
    console.error('❌ Error checking tool descriptions:', error.message);
    return false;
  }
}

// Run the check
const result = checkToolDescriptions();
process.exit(result ? 0 : 1); 