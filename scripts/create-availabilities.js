#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getNexHealthBearerToken() {
  const authHeader = process.env.NEXHEALTH_API_KEY;
  
  if (!authHeader) {
    throw new Error('NEXHEALTH_API_KEY environment variable not set');
  }
  
  const response = await fetch('https://nexhealth.info/authenticates', {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.Nexhealth+json;version=2',
      'Authorization': authHeader
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Auth failed: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  const bearerToken = data.access_token || data.data?.token;
  
  if (!bearerToken) {
    throw new Error('No token found in auth response');
  }
  
  return bearerToken;
}

async function createAvailability(bearerToken, subdomain, locationId, availabilityData) {
  console.log(`🕐 Creating availability for ${availabilityData.specific_date}...`);
  
  // Add subdomain and location_id to the URL as query parameters
  const url = `https://nexhealth.info/availabilities?subdomain=${subdomain}&location_id=${locationId}`;
  
  // Remove location_id from the body since it's now in the URL
  const { location_id, ...bodyData } = availabilityData;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.Nexhealth+json;version=2',
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ availability: bodyData })
  });
  
  const result = await response.json();
  
  if (!response.ok) {
    console.error(`❌ Failed to create availability for ${availabilityData.specific_date}:`, result);
    return { success: false, error: result };
  }
  
  console.log(`✅ Created availability for ${availabilityData.specific_date}`);
  return { success: true, data: result };
}

// Check command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('Usage: node scripts/create-availabilities.js [YYYY-MM-DD] [subdomain] [location_id]');
  console.log('Example: node scripts/create-availabilities.js 2025-12-23 xyz 318534');
  process.exit(1);
}

const [dateArg, subdomain, locationId] = args;

// Validate date format
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
if (!dateRegex.test(dateArg)) {
  console.error('❌ Invalid date format:', dateArg);
  console.error('   Date must be in YYYY-MM-DD format');
  process.exit(1);
}

// Validate location ID is numeric
if (!/^\d+$/.test(locationId)) {
  console.error('❌ Invalid location ID:', locationId);
  console.error('   Location ID must be numeric');
  process.exit(1);
}

console.log(`📅 Date: ${dateArg}`);
console.log(`🏢 Subdomain: ${subdomain}`);
console.log(`📍 Location ID: ${locationId}\n`);

async function createAvailabilitiesWithArgs(date, subdomain, locationId) {
  console.log('🚀 Creating NexHealth Availabilities');
  console.log('===================================\n');
  
  try {
    // Get practice configuration from database (for provider/operatory info)
    console.log('📋 Loading practice configuration...');
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
    
    console.log(`✅ Found practice: ${practice.name}`);
    console.log(`   Appointment types: ${practice.appointmentTypes.length}`);
    console.log(`   Active providers: ${practice.savedProviders.length}`);
    console.log(`   Active operatories: ${practice.savedOperatories.length}\n`);
    
    // Get bearer token
    console.log('🔑 Getting NexHealth bearer token...');
    const bearerToken = await getNexHealthBearerToken();
    console.log('✅ Got bearer token\n');
    
    // Get configuration data
    const providerId = practice.savedProviders[0]?.provider.nexhealthProviderId;
    const operatoryId = practice.savedOperatories[0]?.nexhealthOperatoryId;
    const appointmentTypeIds = practice.appointmentTypes.map(at => parseInt(at.nexhealthAppointmentTypeId));
    
    if (!providerId || !operatoryId) {
      throw new Error('Missing provider or operatory configuration');
    }
    
    console.log('📊 Configuration:');
    console.log(`   Provider ID: ${providerId}`);
    console.log(`   Operatory ID: ${operatoryId}`);
    console.log(`   Appointment Type IDs: [${appointmentTypeIds.join(', ')}]\n`);
    
    console.log(`📅 Processing date: ${date}`);
    
    // Create availability data
    const availabilityData = {
      provider_id: parseInt(providerId),
      location_id: parseInt(locationId),
      operatory_id: parseInt(operatoryId),
      begin_time: "07:00",
      end_time: "19:00",
      appointment_type_ids: appointmentTypeIds,
      specific_date: date,
      active: true
    };
    
    console.log('   Availability data:', JSON.stringify(availabilityData, null, 2));
    
    const result = await createAvailability(bearerToken, subdomain, locationId, availabilityData);
    
    // Summary
    console.log('\n📊 Summary:');
    if (result.success) {
      console.log(`✅ Successfully created availability for ${date}`);
      console.log('🎉 All appointment types now have availability for this date!');
    } else {
      console.log(`❌ Failed to create availability for ${date}`);
      console.log('Error:', result.error?.error || result.error?.description || 'Unknown error');
    }
    
  } catch (error) {
    console.error('❌ Error creating availabilities:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAvailabilitiesWithArgs(dateArg, subdomain, locationId); 