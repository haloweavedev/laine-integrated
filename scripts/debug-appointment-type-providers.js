#!/usr/bin/env node

/**
 * Debug script to find all nexhealthProviderIds that accept a specific nexhealthAppointmentTypeId
 * 
 * Usage: node scripts/debug-appointment-type-providers.js <nexhealthAppointmentTypeId>
 * Example: node scripts/debug-appointment-type-providers.js 1016885
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function findProvidersForAppointmentType(nexhealthAppointmentTypeId) {
  try {
    console.log(`🔍 Looking for providers that accept appointment type ID: ${nexhealthAppointmentTypeId}`);
    console.log('=' .repeat(80));

    // First, find the appointment type
    const appointmentType = await prisma.appointmentType.findFirst({
      where: {
        nexhealthAppointmentTypeId: nexhealthAppointmentTypeId
      },
      include: {
        practice: {
          select: {
            id: true,
            name: true,
            nexhealthSubdomain: true
          }
        }
      }
    });

    if (!appointmentType) {
      console.log(`❌ No appointment type found with nexhealthAppointmentTypeId: ${nexhealthAppointmentTypeId}`);
      return;
    }

    console.log(`✅ Found appointment type:`);
    console.log(`   - ID: ${appointmentType.id}`);
    console.log(`   - Name: ${appointmentType.name}`);
    console.log(`   - Duration: ${appointmentType.duration} minutes`);
    console.log(`   - Practice: ${appointmentType.practice.name || 'Unknown'} (${appointmentType.practice.nexhealthSubdomain})`);
    console.log('');

    // Now find all providers that accept this appointment type
    const providerAcceptances = await prisma.providerAcceptedAppointmentType.findMany({
      where: {
        appointmentTypeId: appointmentType.id
      },
      include: {
        savedProvider: {
          include: {
            provider: {
              select: {
                nexhealthProviderId: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (providerAcceptances.length === 0) {
      console.log(`❌ No providers are configured to accept this appointment type`);
      return;
    }

    console.log(`🎯 Found ${providerAcceptances.length} provider(s) that accept this appointment type:`);
    console.log('');

    const nexhealthProviderIds = [];

    providerAcceptances.forEach((acceptance, index) => {
      const provider = acceptance.savedProvider.provider;
      const isActive = acceptance.savedProvider.isActive;
      
      console.log(`${index + 1}. Provider:`);
      console.log(`   - NexHealth Provider ID: ${provider.nexhealthProviderId}`);
      console.log(`   - Name: ${provider.firstName || ''} ${provider.lastName}`.trim());
      console.log(`   - Saved Provider Active: ${isActive ? '✅' : '❌'}`);
      console.log(`   - Saved Provider ID: ${acceptance.savedProvider.id}`);
      console.log('');

      if (isActive) {
        nexhealthProviderIds.push(provider.nexhealthProviderId);
      }
    });

    console.log('=' .repeat(80));
    console.log(`📋 Summary:`);
    console.log(`   - Total providers found: ${providerAcceptances.length}`);
    console.log(`   - Active providers: ${nexhealthProviderIds.length}`);
    console.log(`   - NexHealth Provider IDs (active only): [${nexhealthProviderIds.join(', ')}]`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get command line argument
const nexhealthAppointmentTypeId = process.argv[2];

if (!nexhealthAppointmentTypeId) {
  console.error('❌ Please provide a nexhealthAppointmentTypeId as an argument');
  console.error('Usage: node scripts/debug-appointment-type-providers.js <nexhealthAppointmentTypeId>');
  console.error('Example: node scripts/debug-appointment-type-providers.js 1016885');
  process.exit(1);
}

// Run the debug function
findProvidersForAppointmentType(nexhealthAppointmentTypeId)
  .catch(console.error); 