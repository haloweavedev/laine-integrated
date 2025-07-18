#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function activateAllOperatories() {
  const practiceId = 'cmd8zk6810000ky0445f078j6';
  
  console.log('🔧 Activating all operatories...');
  console.log(`📋 Practice ID: ${practiceId}\n`);

  try {
    // Verify practice exists
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { id: true, name: true }
    });

    if (!practice) {
      console.error(`❌ Practice with ID ${practiceId} not found`);
      return;
    }

    console.log(`✅ Found practice: ${practice.name}`);

    // Get current operatories status
    const operatories = await prisma.savedOperatory.findMany({
      where: { practiceId },
      select: {
        id: true,
        name: true,
        nexhealthOperatoryId: true,
        isActive: true
      },
      orderBy: { name: 'asc' }
    });

    if (operatories.length === 0) {
      console.log('❌ No operatories found for this practice');
      console.log('   Run sync from NexHealth first to import operatories');
      return;
    }

    console.log(`\n🏥 Found ${operatories.length} operatories:`);
    console.log('=' .repeat(60));

    const activeCount = operatories.filter(op => op.isActive).length;
    const inactiveCount = operatories.filter(op => !op.isActive).length;

    operatories.forEach((op, index) => {
      const status = op.isActive ? '✅ ACTIVE' : '❌ INACTIVE';
      console.log(`${index + 1}. ${op.name} (ID: ${op.nexhealthOperatoryId}) - ${status}`);
    });

    console.log(`\n📊 Current status:`);
    console.log(`   • Active: ${activeCount}`);
    console.log(`   • Inactive: ${inactiveCount}`);

    if (inactiveCount === 0) {
      console.log('\n🎉 All operatories are already active!');
      console.log('   No changes needed.');
      return;
    }

    // Activate all inactive operatories
    console.log(`\n🚀 Activating ${inactiveCount} inactive operatories...`);

    const updateResult = await prisma.savedOperatory.updateMany({
      where: { 
        practiceId,
        isActive: false
      },
      data: {
        isActive: true,
        updatedAt: new Date()
      }
    });

    console.log(`✅ Successfully activated ${updateResult.count} operatories!`);

    // Show final status
    const finalActiveCount = await prisma.savedOperatory.count({
      where: { practiceId, isActive: true }
    });

    console.log(`\n🎉 All operatories are now active!`);
    console.log(`📊 Final status: ${finalActiveCount}/${operatories.length} operatories active`);
    console.log('\n💡 Next steps:');
    console.log('   1. Go to Practice Config > Providers Config');
    console.log('   2. Configure providers and assign them to operatories');
    console.log('   3. All operatories should now appear in the assignment lists');

  } catch (error) {
    console.error('❌ Error activating operatories:', error);
  } finally {
    await prisma.$disconnect();
  }
}

activateAllOperatories(); 