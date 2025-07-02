const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkProviderConfiguration() {
  try {
    console.log('🔍 Checking Provider Configuration Database Contents...\n');
    
    // Check practices
    const practices = await prisma.practice.findMany();
    console.log(`📊 Found ${practices.length} practice(s)`);
    
    if (practices.length === 0) {
      console.log('❌ No practices found in database');
      return;
    }
    
    const practice = practices[0]; // Use first practice
    console.log(`🏥 Using practice: ${practice.nexhealthSubdomain || 'No subdomain'}\n`);
    
    // Check raw providers (synced from NexHealth)
    const allProviders = await prisma.provider.findMany({
      where: { practiceId: practice.id }
    });
    console.log(`👥 Raw Providers (synced): ${allProviders.length}`);
    allProviders.forEach(p => {
      console.log(`  - ${p.firstName || ''} ${p.lastName} (ID: ${p.nexhealthProviderId})`);
    });
    
    // Check saved providers (activated)
    const savedProviders = await prisma.savedProvider.findMany({
      where: { practiceId: practice.id },
      include: {
        provider: true,
        defaultAppointmentType: true,
        defaultOperatory: true,
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
    });
    console.log(`\n✅ Saved Providers (activated): ${savedProviders.length}`);
    
    savedProviders.forEach(sp => {
      console.log(`\n📋 Provider: ${sp.provider.firstName || ''} ${sp.provider.lastName}`);
      console.log(`   - Active: ${sp.isActive}`);
      console.log(`   - Default Appointment Type: ${sp.defaultAppointmentType?.name || 'None'}`);
      console.log(`   - Default Operatory: ${sp.defaultOperatory?.name || 'None'}`);
      console.log(`   - Accepted Appointment Types: ${sp.acceptedAppointmentTypes.length}`);
      sp.acceptedAppointmentTypes.forEach(aat => {
        console.log(`     * ${aat.appointmentType.name}`);
      });
      console.log(`   - Assigned Operatories: ${sp.assignedOperatories.length}`);
      sp.assignedOperatories.forEach(ao => {
        console.log(`     * ${ao.savedOperatory.name} (ID: ${ao.savedOperatory.nexhealthOperatoryId})`);
      });
    });
    
    // Check appointment types
    const appointmentTypes = await prisma.appointmentType.findMany({
      where: { practiceId: practice.id }
    });
    console.log(`\n🕐 Appointment Types: ${appointmentTypes.length}`);
    appointmentTypes.forEach(at => {
      console.log(`  - ${at.name} (${at.duration} min, Spoken: ${at.spokenName || 'None'})`);
    });
    
    // Check operatories
    const operatories = await prisma.savedOperatory.findMany({
      where: { practiceId: practice.id }
    });
    console.log(`\n🏢 Operatories: ${operatories.length}`);
    operatories.forEach(op => {
      console.log(`  - ${op.name} (NexHealth ID: ${op.nexhealthOperatoryId}, Active: ${op.isActive})`);
    });
    
    // Check provider-operatory assignments
    const assignments = await prisma.providerOperatoryAssignment.findMany({
      include: {
        savedProvider: {
          include: {
            provider: true
          }
        },
        savedOperatory: true
      }
    });
    console.log(`\n🔗 Provider-Operatory Assignments: ${assignments.length}`);
    assignments.forEach(assignment => {
      console.log(`  - ${assignment.savedProvider.provider.firstName || ''} ${assignment.savedProvider.provider.lastName} → ${assignment.savedOperatory.name}`);
    });
    
    // Summary
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Raw Providers: ${allProviders.length}`);
    console.log(`   Activated Providers: ${savedProviders.length}`);
    console.log(`   Appointment Types: ${appointmentTypes.length}`);
    console.log(`   Operatories: ${operatories.length}`);
    console.log(`   Provider-Operatory Assignments: ${assignments.length}`);
    
    if (savedProviders.length === 0) {
      console.log(`\n❌ NO ACTIVATED PROVIDERS FOUND!`);
      console.log(`   This means either:`);
      console.log(`   1. Providers haven't been activated yet`);
      console.log(`   2. Activation API is not working`);
      console.log(`   3. Data is not being saved properly`);
    }
    
    if (assignments.length === 0 && savedProviders.length > 0) {
      console.log(`\n⚠️  NO OPERATORY ASSIGNMENTS FOUND!`);
      console.log(`   Provider settings save functionality may be broken`);
    }
    
  } catch (error) {
    console.error('❌ Error checking provider configuration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProviderConfiguration(); 