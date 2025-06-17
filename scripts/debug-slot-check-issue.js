const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugSlotCheckIssue() {
  try {
    console.log('🔍 Debug: Slot Check Issue Investigation');
    console.log('=====================================\n');

    // Get practice data (assuming there's only one practice for now)
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
          }
        },
        savedOperatories: true
      }
    });

    if (!practice) {
      console.log('❌ No practice found in database');
      return;
    }

    console.log(`📋 Practice: ${practice.name || 'Unnamed'} (ID: ${practice.id})`);
    console.log(`🌐 NexHealth Subdomain: ${practice.nexhealthSubdomain}`);
    console.log(`📍 NexHealth Location ID: ${practice.nexhealthLocationId}\n`);

    // Look for appointment type by nexhealthAppointmentTypeId (1016885)
    console.log('🎯 APPOINTMENT TYPE ANALYSIS');
    console.log('============================');
    
    const appointmentType = practice.appointmentTypes.find(at => at.nexhealthAppointmentTypeId === '1016885');
    
    if (!appointmentType) {
      console.log('❌ Appointment type with nexhealthAppointmentTypeId = 1016885 NOT FOUND');
      console.log('\n📝 Available appointment types:');
      practice.appointmentTypes.forEach(at => {
        console.log(`   - ${at.name} (Laine ID: ${at.id}, NexHealth ID: ${at.nexhealthAppointmentTypeId}, Duration: ${at.duration}min)`);
      });
      return;
    }

    console.log(`✅ Found appointment type: ${appointmentType.name}`);
    console.log(`   - Laine ID (CUID): ${appointmentType.id}`);
    console.log(`   - NexHealth ID: ${appointmentType.nexhealthAppointmentTypeId}`);
    console.log(`   - Duration: ${appointmentType.duration} minutes`);

    // Look for provider by nexhealthProviderId (377851139)
    console.log('\n👨‍⚕️ PROVIDER ANALYSIS');
    console.log('=====================');
    
    const provider = practice.providers.find(p => p.nexhealthProviderId === '377851139');
    
    if (!provider) {
      console.log('❌ Provider with nexhealthProviderId = 377851139 NOT FOUND');
      console.log('\n📝 Available providers:');
      practice.providers.forEach(p => {
        console.log(`   - ${p.firstName || ''} ${p.lastName} (Laine ID: ${p.id}, NexHealth ID: ${p.nexhealthProviderId})`);
      });
      return;
    }

    console.log(`✅ Found provider: ${provider.firstName || ''} ${provider.lastName}`);
    console.log(`   - Laine ID (CUID): ${provider.id}`);
    console.log(`   - NexHealth ID: ${provider.nexhealthProviderId}`);

    // Check if provider is saved and active
    console.log('\n💾 SAVED PROVIDER ANALYSIS');
    console.log('===========================');
    
    const savedProvider = practice.savedProviders.find(sp => sp.provider.id === provider.id);
    
    if (!savedProvider) {
      console.log('❌ Provider is NOT saved in SavedProviders table');
      console.log('\n📝 Available saved providers:');
      practice.savedProviders.forEach(sp => {
        console.log(`   - ${sp.provider.firstName || ''} ${sp.provider.lastName} (Active: ${sp.isActive})`);
      });
      return;
    }

    console.log(`✅ Provider is saved: ${savedProvider.provider.firstName || ''} ${savedProvider.provider.lastName}`);
    console.log(`   - Active: ${savedProvider.isActive}`);
    console.log(`   - Saved Provider ID: ${savedProvider.id}`);

    if (!savedProvider.isActive) {
      console.log('⚠️  WARNING: Provider is saved but NOT ACTIVE!');
    }

    // Check appointment type acceptance
    console.log('\n🎭 APPOINTMENT TYPE ACCEPTANCE ANALYSIS');
    console.log('=======================================');
    
    console.log(`📊 Provider accepts ${savedProvider.acceptedAppointmentTypes.length} appointment types:`);
    
    if (savedProvider.acceptedAppointmentTypes.length === 0) {
      console.log('   ℹ️  No specific appointment types configured (backward compatibility - accepts all)');
    } else {
      savedProvider.acceptedAppointmentTypes.forEach(relation => {
        console.log(`   - ${relation.appointmentType.name} (${relation.appointmentType.id})`);
      });
    }

    const acceptsThisType = savedProvider.acceptedAppointmentTypes.length === 0 || 
                           savedProvider.acceptedAppointmentTypes.some(relation => 
                             relation.appointmentType.id === appointmentType.id
                           );

    console.log(`\n🎯 Does provider accept appointment type "${appointmentType.name}"? ${acceptsThisType ? '✅ YES' : '❌ NO'}`);

    // Check operatory assignments
    console.log('\n🏥 OPERATORY ASSIGNMENT ANALYSIS');
    console.log('=================================');
    
    console.log(`🔗 Provider is assigned to ${savedProvider.assignedOperatories.length} operatories:`);
    
    if (savedProvider.assignedOperatories.length === 0) {
      console.log('   ⚠️  WARNING: Provider has no operatory assignments!');
    } else {
      savedProvider.assignedOperatories.forEach(assignment => {
        console.log(`   - ${assignment.savedOperatory.name} (${assignment.savedOperatory.nexhealthOperatoryId})`);
      });
    }

    // Summary and recommendations
    console.log('\n📋 SUMMARY & RECOMMENDATIONS');
    console.log('=============================');
    
    const issues = [];
    
    if (!savedProvider.isActive) {
      issues.push('Provider is not active');
    }
    
    if (!acceptsThisType) {
      issues.push('Provider does not accept this appointment type');
    }
    
    if (savedProvider.assignedOperatories.length === 0) {
      issues.push('Provider has no operatory assignments');
    }

    if (issues.length === 0) {
      console.log('✅ Configuration looks correct! The issue might be elsewhere.');
      console.log('\n🔧 FOR TESTING, use these values:');
      console.log(`   - appointmentTypeId: "${appointmentType.id}" (Laine CUID)`);
      console.log(`   - providerIds: ["${provider.id}"] (optional filter)`);
    } else {
      console.log('❌ Issues found:');
      issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
      
      console.log('\n🔧 FIXES NEEDED:');
      if (!savedProvider.isActive) {
        console.log('   - Activate the provider in the UI');
      }
      if (!acceptsThisType) {
        console.log('   - Configure provider to accept this appointment type');
      }
      if (savedProvider.assignedOperatories.length === 0) {
        console.log('   - Assign operatories to the provider');
      }
    }

    // Additional debug info
    console.log('\n🔍 ADDITIONAL DEBUG INFO');
    console.log('========================');
    console.log(`Total appointment types: ${practice.appointmentTypes.length}`);
    console.log(`Total providers: ${practice.providers.length}`);
    console.log(`Total saved providers: ${practice.savedProviders.length}`);
    console.log(`Total active saved providers: ${practice.savedProviders.filter(sp => sp.isActive).length}`);
    console.log(`Total saved operatories: ${practice.savedOperatories.length}`);
    console.log(`Total active saved operatories: ${practice.savedOperatories.filter(so => so.isActive).length}`);

  } catch (error) {
    console.error('❌ Error during debug:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugSlotCheckIssue(); 