#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAppointmentTypes() {
  console.log('📋 Checking appointment types for Royal Oak Family Dental...');
  
  try {
    const practice = await prisma.practice.findFirst({
      where: { name: { contains: 'Royal Oak' } },
      include: { appointmentTypes: true }
    });
    
    if (practice) {
      console.log('\n✅ Found practice:', practice.name);
      console.log('Appointment types:');
      practice.appointmentTypes.forEach((type, index) => {
        console.log(`  ${index + 1}. ID: ${type.nexhealthAppointmentTypeId} | Name: ${type.name} | Duration: ${type.durationMinutes}min`);
      });
      
      console.log('\n🔍 Analysis:');
      console.log('- The tool call used appointment type ID: 997003');
      console.log('- The curl test used appointment type ID: 1001465');
      
      const usedType = practice.appointmentTypes.find(t => t.nexhealthAppointmentTypeId === '997003');
      const testType = practice.appointmentTypes.find(t => t.nexhealthAppointmentTypeId === '1001465');
      
      if (usedType) {
        console.log(`✅ 997003 found: ${usedType.name} (${usedType.durationMinutes}min)`);
      } else {
        console.log('❌ 997003 not found in configured appointment types!');
      }
      
      if (testType) {
        console.log(`✅ 1001465 found: ${testType.name} (${testType.durationMinutes}min)`);
      } else {
        console.log('❌ 1001465 not found in configured appointment types!');
      }
      
    } else {
      console.log('❌ No practice found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAppointmentTypes(); 