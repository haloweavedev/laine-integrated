#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function showAllAppointmentTypes() {
  console.log('📅 All Appointment Types');
  console.log('========================\n');

  try {
    // Find the practice
    const practice = await prisma.practice.findFirst({
      select: {
        id: true,
        name: true
      }
    });

    if (!practice) {
      console.error('❌ No practice found');
      return;
    }

    console.log(`📋 Practice: ${practice.name}`);
    console.log(`🆔 Practice ID: ${practice.id}\n`);

    // Get all appointment types with all the requested fields
    const appointmentTypes = await prisma.appointmentType.findMany({
      where: { practiceId: practice.id },
      select: {
        id: true,
        name: true,
        duration: true,
        keywords: true,
        check_immediate_next_available: true,
        spokenName: true,
        bookableOnline: true,
        nexhealthAppointmentTypeId: true,
        lastSyncError: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { name: 'asc' }
    });

    if (appointmentTypes.length === 0) {
      console.log('❌ No appointment types found');
      console.log('   Run sync from NexHealth or create appointment types first');
      return;
    }

    console.log(`🎯 Found ${appointmentTypes.length} appointment types:\n`);
    console.log('=' .repeat(120));

    appointmentTypes.forEach((apt, index) => {
      console.log(`\n[${index + 1}/${appointmentTypes.length}] ${apt.name}`);
      console.log('-' .repeat(80));
      
      // Basic Info
      console.log(`📝 Name: ${apt.name}`);
      console.log(`⏱️  Duration: ${apt.duration} minutes`);
      console.log(`🗣️  Spoken Name: ${apt.spokenName || 'Not set'}`);
      
      // Keywords
      if (apt.keywords) {
        try {
          const keywordsArray = JSON.parse(apt.keywords);
          if (Array.isArray(keywordsArray)) {
            console.log(`🔍 Keywords (${keywordsArray.length}): ${keywordsArray.join(', ')}`);
          } else {
            console.log(`🔍 Keywords: ${apt.keywords}`);
          }
        } catch (error) {
          console.log(`🔍 Keywords: ${apt.keywords}`);
        }
      } else {
        console.log(`🔍 Keywords: Not set`);
      }
      
      // Configuration flags
      console.log(`⚡ Immediate Check: ${apt.check_immediate_next_available ? '✅ TRUE' : '❌ FALSE'}`);
      console.log(`🌐 Bookable Online: ${apt.bookableOnline === true ? '✅ TRUE' : apt.bookableOnline === false ? '❌ FALSE' : '❓ NOT SET'}`);
      
      // IDs and status
      console.log(`🆔 NexHealth ID: ${apt.nexhealthAppointmentTypeId}`);
      console.log(`🆔 Local ID: ${apt.id}`);
      
      // Sync status
      if (apt.lastSyncError) {
        console.log(`❌ Sync Error: ${apt.lastSyncError}`);
      } else {
        console.log(`✅ Sync Status: OK`);
      }
      
      // Timestamps
      console.log(`📅 Created: ${apt.createdAt.toLocaleString()}`);
      console.log(`📅 Updated: ${apt.updatedAt.toLocaleString()}`);
    });

    console.log('\n' + '=' .repeat(120));
    
    // Summary statistics
    console.log(`\n📊 Summary Statistics:`);
    console.log(`   • Total appointment types: ${appointmentTypes.length}`);
    console.log(`   • With keywords: ${appointmentTypes.filter(apt => apt.keywords).length}`);
    console.log(`   • Without keywords: ${appointmentTypes.filter(apt => !apt.keywords).length}`);
    console.log(`   • Immediate check enabled: ${appointmentTypes.filter(apt => apt.check_immediate_next_available).length}`);
    console.log(`   • Immediate check disabled: ${appointmentTypes.filter(apt => !apt.check_immediate_next_available).length}`);
    console.log(`   • Bookable online: ${appointmentTypes.filter(apt => apt.bookableOnline === true).length}`);
    console.log(`   • Not bookable online: ${appointmentTypes.filter(apt => apt.bookableOnline === false).length}`);
    console.log(`   • Bookable status not set: ${appointmentTypes.filter(apt => apt.bookableOnline === null).length}`);
    console.log(`   • With sync errors: ${appointmentTypes.filter(apt => apt.lastSyncError).length}`);

    // Duration analysis
    const durations = appointmentTypes.map(apt => apt.duration);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const avgDuration = Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);

    console.log(`\n⏱️  Duration Analysis:`);
    console.log(`   • Shortest: ${minDuration} minutes`);
    console.log(`   • Longest: ${maxDuration} minutes`);
    console.log(`   • Average: ${avgDuration} minutes`);

    // Group by duration
    const durationGroups = durations.reduce((groups, duration) => {
      groups[duration] = (groups[duration] || 0) + 1;
      return groups;
    }, {});

    console.log(`\n📈 Duration Distribution:`);
    Object.entries(durationGroups)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([duration, count]) => {
        console.log(`   • ${duration} minutes: ${count} appointment type${count > 1 ? 's' : ''}`);
      });

  } catch (error) {
    console.error('❌ Error fetching appointment types:', error);
  } finally {
    await prisma.$disconnect();
  }
}

showAllAppointmentTypes(); 