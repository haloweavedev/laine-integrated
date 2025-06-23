#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Helper function to check if a time falls within lunch break (1-2 PM local time)
function isLunchBreakSlot(slotTimeString) {
  try {
    // Parse the slot time which includes timezone info (e.g., "2025-12-29T07:00:00.000-06:00")
    const slotTime = new Date(slotTimeString);
    
    // For now, assuming Central Time (America/Chicago) for practice timezone
    // TODO: Store actual practice timezone in database
    const localTime = slotTime.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const [hour, minute] = localTime.split(':').map(Number);
    const totalMinutes = hour * 60 + minute;
    
    // Lunch break: 1:00 PM (13:00) to 2:00 PM (14:00) - 780 to 840 minutes from midnight
    const lunchStart = 13 * 60; // 1 PM in minutes
    const lunchEnd = 14 * 60;   // 2 PM in minutes
    
    return totalMinutes >= lunchStart && totalMinutes < lunchEnd;
  } catch (error) {
    console.error('Error parsing slot time for lunch break check:', error);
    return false; // If we can't parse, don't filter out the slot
  }
}

// Get NexHealth bearer token
async function getNexHealthBearerToken() {
  const authHeader = process.env.NEXHEALTH_API_KEY;
  
  if (!authHeader) {
    throw new Error('NEXHEALTH_API_KEY environment variable not set');
  }
  
  try {
    const response = await fetch('https://nexhealth.info/authenticates', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.Nexhealth+json;version=2',
        'Authorization': authHeader
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NexHealth Authentication failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    if (!result.data || !result.data.token) {
      throw new Error('Invalid token response from NexHealth');
    }
    
    return result.data.token;
  } catch (error) {
    console.error('Error getting NexHealth bearer token:', error);
    throw error;
  }
}

// Fetch from NexHealth API
async function fetchNexhealthAPI(path, subdomain, params = {}) {
  const bearerToken = await getNexHealthBearerToken();
  
  const url = new URL(`https://nexhealth.info${path}`);
  
  // Add subdomain
  url.searchParams.append('subdomain', subdomain);
  
  // Add other params
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => url.searchParams.append(key, v.toString()));
    } else {
      url.searchParams.append(key, value.toString());
    }
  });

  console.log(`🌐 Making API call to: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.Nexhealth+json;version=2',
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NexHealth API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data;
}

async function debugCheckSlots(requestedDate, nexhealthAppointmentTypeId, daysToSearch = 1) {
  try {
    console.log('🔍 DEBUG: Check Slots Investigation');
    console.log('===================================\n');
    console.log(`📅 Requested Date: ${requestedDate}`);
    console.log(`🎯 NexHealth Appointment Type ID: ${nexhealthAppointmentTypeId}`);
    console.log(`📊 Days to Search: ${daysToSearch}\n`);

    // Get practice data
    const practice = await prisma.practice.findFirst({
      include: {
        appointmentTypes: true,
        providers: true,
        savedProviders: {
          include: {
            provider: true,
            acceptedAppointmentTypes: {
              include: {
                appointmentType: true
              }
            },
            assignedOperatories: {
              include: {
                savedOperatory: true
              }
            }
          },
          where: { isActive: true }
        },
        savedOperatories: {
          where: { isActive: true }
        }
      }
    });

    if (!practice) {
      console.error('❌ No practice found in database');
      return;
    }

    console.log(`📋 Practice: ${practice.name || 'Unnamed'} (ID: ${practice.id})`);
    console.log(`🌐 NexHealth Subdomain: ${practice.nexhealthSubdomain}`);
    console.log(`📍 NexHealth Location ID: ${practice.nexhealthLocationId}\n`);

    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      console.error('❌ NexHealth configuration incomplete. Please configure subdomain and location ID.');
      return;
    }

    // Find the appointment type by NexHealth ID
    console.log('🎯 APPOINTMENT TYPE LOOKUP');
    console.log('===========================');
    
    const appointmentType = practice.appointmentTypes.find(at => 
      at.nexhealthAppointmentTypeId === nexhealthAppointmentTypeId
    );

    if (!appointmentType) {
      console.error(`❌ Appointment type with nexhealthAppointmentTypeId = ${nexhealthAppointmentTypeId} NOT FOUND`);
      console.log('\n📝 Available appointment types:');
      practice.appointmentTypes.forEach(at => {
        console.log(`   - ${at.name} (Laine ID: ${at.id}, NexHealth ID: ${at.nexhealthAppointmentTypeId}, Duration: ${at.duration}min)`);
      });
      return;
    }

    console.log(`✅ Found AppointmentType:`);
    console.log(`  - Laine CUID: ${appointmentType.id}`);
    console.log(`  - Name: ${appointmentType.name}`);
    console.log(`  - Duration (for slot_length): ${appointmentType.duration}`);
    console.log(`  - NexHealth ID: ${appointmentType.nexhealthAppointmentTypeId}\n`);

    // Find eligible SavedProviders who accept this appointment type
    console.log('👨‍⚕️ PROVIDER FILTERING');
    console.log('====================');
    
    let eligibleSavedProviders = practice.savedProviders.filter(sp => {
      // Must be active
      if (!sp.isActive) return false;
      
      // If provider has no accepted appointment types configured, include them (backward compatibility)
      if (sp.acceptedAppointmentTypes.length === 0) {
        return true;
      }
      
      // Otherwise, check if they accept this specific appointment type using Laine CUID
      return sp.acceptedAppointmentTypes.some(
        relation => relation.appointmentType.id === appointmentType.id
      );
    });

    console.log(`📋 Provider filtering results:`);
    console.log(`  - Total active SavedProviders in practice: ${practice.savedProviders.length}`);
    console.log(`  - SavedProviders accepting this AppointmentType: ${eligibleSavedProviders.length}`);
    
    if (eligibleSavedProviders.length === 0) {
      console.error('❌ No providers are configured to accept this appointment type');
      return;
    }

    console.log(`  - Eligible SavedProvider details:`);
    eligibleSavedProviders.forEach(sp => {
      console.log(`    • ${sp.provider.firstName || ''} ${sp.provider.lastName}`.trim());
      console.log(`      - SavedProvider ID: ${sp.id}`);
      console.log(`      - Provider ID: ${sp.provider.id}`);
      console.log(`      - NexHealth Provider ID: ${sp.provider.nexhealthProviderId}`);
      console.log(`      - Accepted appointment types: ${sp.acceptedAppointmentTypes.length}`);
    });

    // Collect unique nexhealthProviderId values for NexHealth API
    const nexhealthProviderIds = [...new Set(
      eligibleSavedProviders.map(sp => sp.provider.nexhealthProviderId)
    )];

    console.log(`\n🔗 NexHealth Provider IDs extracted: ${nexhealthProviderIds.join(', ')}`);

    // Get operatories assigned to these eligible providers
    console.log('\n🏥 OPERATORY DERIVATION');
    console.log('=======================');
    
    const eligibleOperatories = [];
    
    for (const savedProvider of eligibleSavedProviders) {
      const assignedOperatories = savedProvider.assignedOperatories.map(assignment => assignment.savedOperatory);
      eligibleOperatories.push(...assignedOperatories);
    }

    // Remove duplicates
    const uniqueOperatories = eligibleOperatories.filter((operatory, index, self) => 
      index === self.findIndex(o => o.id === operatory.id)
    );

    console.log(`🏢 Operatories derived from eligible providers: ${uniqueOperatories.length}`);
    uniqueOperatories.forEach(op => {
      console.log(`  - ${op.name} (Laine ID: ${op.id}, NexHealth ID: ${op.nexhealthOperatoryId})`);
    });

    // Extract nexhealthOperatoryIds for the API call
    const nexhealthOperatoryIds = uniqueOperatories.map(operatory => operatory.nexhealthOperatoryId);

    console.log(`\n🔗 NexHealth Operatory IDs extracted: ${nexhealthOperatoryIds.join(', ')}`);

    // Build NexHealth API parameters
    console.log('\n🚀 NEXHEALTH API CALL');
    console.log('======================');
    
    const params = {
      start_date: requestedDate,
      days: daysToSearch,
      'lids[]': [practice.nexhealthLocationId],
      'pids[]': nexhealthProviderIds,
      slot_length: appointmentType.duration,
      overlapping_operatory_slots: 'false'
    };

    // Add operatory IDs if we have any
    if (nexhealthOperatoryIds.length > 0) {
      params['operatory_ids[]'] = nexhealthOperatoryIds;
    }

    console.log(`📋 API Parameters:`);
    console.log(`  - Endpoint: /appointment_slots`);
    console.log(`  - Subdomain: ${practice.nexhealthSubdomain}`);
    console.log(`  - Params: ${JSON.stringify(params, null, 4)}`);
    console.log(`  - IMPORTANT: slot_length = ${appointmentType.duration} (from AppointmentType.duration)`);
    console.log(`  - IMPORTANT: overlapping_operatory_slots = 'false'`);
    console.log(`  - IMPORTANT: NO appointment_type_id parameter sent to NexHealth\n`);

    // Call NexHealth API
    const slotsResponse = await fetchNexhealthAPI(
      '/appointment_slots',
      practice.nexhealthSubdomain,
      params
    );

    console.log('📡 NexHealth API Response received\n');

    // Parse response and extract slots
    const rawSlots = [];
    
    if (slotsResponse?.data && Array.isArray(slotsResponse.data)) {
      // Extract all slots from all providers
      for (const providerData of slotsResponse.data) {
        if (providerData.slots && Array.isArray(providerData.slots)) {
          rawSlots.push(...providerData.slots.map(slot => ({
            ...slot,
            provider_id: providerData.pid,
            location_id: providerData.lid
          })));
        }
      }
    }

    console.log(`📊 Slot processing:`);
    console.log(`  - Raw slots from NexHealth API: ${rawSlots.length}`);

    // Filter out lunch break slots (1-2 PM local time)
    const filteredSlots = rawSlots.filter(slot => !isLunchBreakSlot(slot.time));

    console.log(`  - Slots after lunch break filtering: ${filteredSlots.length}`);
    console.log(`  - Lunch break slots filtered out: ${rawSlots.length - filteredSlots.length}\n`);

    // Create provider lookup map
    const providerLookup = new Map();
    eligibleSavedProviders.forEach(sp => {
      providerLookup.set(sp.provider.nexhealthProviderId, {
        id: sp.provider.id,
        nexhealthProviderId: sp.provider.nexhealthProviderId,
        name: `${sp.provider.firstName || ''} ${sp.provider.lastName}`.trim()
      });
    });

    // Create operatory lookup map
    const operatoryLookup = new Map();
    uniqueOperatories.forEach(operatory => {
      operatoryLookup.set(operatory.nexhealthOperatoryId, {
        id: operatory.id,
        nexhealthOperatoryId: operatory.nexhealthOperatoryId,
        name: operatory.name
      });
    });

    // Format slots for display
    console.log('📅 AVAILABLE SLOTS');
    console.log('==================');
    
    if (filteredSlots.length === 0) {
      console.log('❌ No available slots found for the requested date and criteria\n');
      
      console.log('🔍 TROUBLESHOOTING SUGGESTIONS:');
      console.log('1. Check if providers have availability set up for that date');
      console.log('2. Verify the appointment type duration matches expectations');
      console.log('3. Try a different date closer to current date');
      console.log('4. Check operatory assignments for providers');
      console.log('5. Verify practice timezone settings');
    } else {
      console.log(`✅ Found ${filteredSlots.length} available slots:\n`);
      
      const formattedSlots = filteredSlots.map((slot, index) => {
        // Parse the time string correctly to preserve the timezone
        const startTime = new Date(slot.time);
        const endTime = new Date(slot.end_time);
        
        // Use the timezone from the original date string for formatting
        const timeString = startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/Chicago' // Explicitly use Central Time to match NexHealth
        });

        const endTimeString = endTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/Chicago'
        });

        // Get provider and operatory details
        const providerInfo = providerLookup.get(slot.provider_id.toString()) || { 
          name: `Provider ${slot.provider_id}`, 
          nexhealthProviderId: slot.provider_id 
        };
        
        const operatoryInfo = slot.operatory_id ? 
          operatoryLookup.get(slot.operatory_id.toString()) || { 
            name: `Operatory ${slot.operatory_id}`, 
            nexhealthOperatoryId: slot.operatory_id 
          } : null;
        
        return {
          slot_id: `slot_${index}`,
          time: slot.time,
          end_time: slot.end_time,
          display_time: timeString,
          display_end_time: endTimeString,
          display_range: `${timeString} - ${endTimeString}`,
          operatory_id: slot.operatory_id,
          provider_id: slot.provider_id,
          location_id: slot.location_id,
          provider_info: providerInfo,
          operatory_info: operatoryInfo
        };
      });

      // Sort slots by time
      formattedSlots.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

      // Display slots
      formattedSlots.forEach((slot, index) => {
        console.log(`${index + 1}. ${slot.display_range}`);
        console.log(`   Provider: ${slot.provider_info.name} (ID: ${slot.provider_info.nexhealthProviderId})`);
        if (slot.operatory_info) {
          console.log(`   Operatory: ${slot.operatory_info.name} (ID: ${slot.operatory_info.nexhealthOperatoryId})`);
        }
        console.log(`   Raw time: ${slot.time}`);
        console.log('');
      });
    }

    console.log('✅ Slot check debug completed successfully!\n');

    // Summary
    console.log('📋 SUMMARY');
    console.log('==========');
    console.log(`Requested Date: ${requestedDate}`);
    console.log(`Appointment Type: ${appointmentType.name} (${appointmentType.duration} min)`);
    console.log(`Providers Checked: ${eligibleSavedProviders.length}`);
    console.log(`Operatories Checked: ${uniqueOperatories.length}`);
    console.log(`Available Slots: ${filteredSlots.length}`);

  } catch (error) {
    console.error('❌ Error during slot check debug:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node debug-check-slots.js <date> <nexhealth-appointment-type-id> [days-to-search]');
    console.log('');
    console.log('Examples:');
    console.log('  node debug-check-slots.js 2025-12-23 1016885');
    console.log('  node debug-check-slots.js 2025-12-23 1016885 3');
    console.log('');
    console.log('Arguments:');
    console.log('  date                        - Date in YYYY-MM-DD format');
    console.log('  nexhealth-appointment-type-id - NexHealth appointment type ID');
    console.log('  days-to-search             - Number of days to search (default: 1)');
    process.exit(1);
  }

  const [requestedDate, nexhealthAppointmentTypeId, daysToSearchStr] = args;
  const daysToSearch = daysToSearchStr ? parseInt(daysToSearchStr) : 1;

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    console.error('❌ Invalid date format. Please use YYYY-MM-DD format.');
    process.exit(1);
  }

  // Validate days to search
  if (isNaN(daysToSearch) || daysToSearch < 1 || daysToSearch > 30) {
    console.error('❌ Invalid days to search. Must be a number between 1 and 30.');
    process.exit(1);
  }

  await debugCheckSlots(requestedDate, nexhealthAppointmentTypeId, daysToSearch);
}

main().catch(console.error); 