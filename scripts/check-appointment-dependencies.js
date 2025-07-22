const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAppointmentDependencies(nexhealthAppointmentTypeId) {
  try {
    console.log(`🔍 Checking dependencies for NexHealth Appointment Type ID: ${nexhealthAppointmentTypeId}\n`);
    
    // Find the appointment type by NexHealth ID
    const appointmentType = await prisma.appointmentType.findFirst({
      where: { 
        nexhealthAppointmentTypeId: nexhealthAppointmentTypeId 
      },
      include: {
        practice: true,
        acceptedByProviders: {
          include: {
            savedProvider: {
              include: {
                provider: true,
                assignedOperatories: {
                  include: {
                    savedOperatory: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!appointmentType) {
      console.log(`❌ No appointment type found with NexHealth ID: ${nexhealthAppointmentTypeId}`);
      return;
    }

    // Display appointment type information
    console.log(`📋 APPOINTMENT TYPE DETAILS:`);
    console.log(`   Name: ${appointmentType.name}`);
    console.log(`   Duration: ${appointmentType.duration} minutes`);
    console.log(`   Spoken Name: ${appointmentType.spokenName || 'None'}`);
    console.log(`   Bookable Online: ${appointmentType.bookableOnline ? 'Yes' : 'No'}`);
    console.log(`   Practice: ${appointmentType.practice.name || appointmentType.practice.nexhealthSubdomain || 'Unnamed'}`);
    console.log(`   Keywords: ${appointmentType.keywords || 'None'}\n`);

    // Display associated providers and their operatories
    console.log(`👥 ASSOCIATED PROVIDERS (${appointmentType.acceptedByProviders.length}):`);
    
    if (appointmentType.acceptedByProviders.length === 0) {
      console.log(`   ❌ No providers are configured to accept this appointment type!`);
    } else {
      appointmentType.acceptedByProviders.forEach((acceptance, index) => {
        const provider = acceptance.savedProvider.provider;
        const operatories = acceptance.savedProvider.assignedOperatories;
        
        console.log(`\n   ${index + 1}. ${provider.firstName || ''} ${provider.lastName}`);
        console.log(`      NexHealth Provider ID: ${provider.nexhealthProviderId}`);
        console.log(`      Active: ${acceptance.savedProvider.isActive ? 'Yes' : 'No'}`);
        console.log(`      Assigned Operatories (${operatories.length}):`);
        
        if (operatories.length === 0) {
          console.log(`         ❌ No operatories assigned to this provider!`);
        } else {
          operatories.forEach((assignment) => {
            const operatory = assignment.savedOperatory;
            console.log(`         - ${operatory.name} (NexHealth ID: ${operatory.nexhealthOperatoryId}, Active: ${operatory.isActive ? 'Yes' : 'No'})`);
          });
        }
      });
    }

    // Summary and warnings
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Appointment Duration: ${appointmentType.duration} minutes`);
    console.log(`   Total Providers: ${appointmentType.acceptedByProviders.length}`);
    
    const activeProviders = appointmentType.acceptedByProviders.filter(ap => ap.savedProvider.isActive);
    console.log(`   Active Providers: ${activeProviders.length}`);
    
    const totalOperatories = appointmentType.acceptedByProviders.reduce((sum, ap) => {
      return sum + ap.savedProvider.assignedOperatories.length;
    }, 0);
    console.log(`   Total Operatories: ${totalOperatories}`);
    
    const activeOperatories = appointmentType.acceptedByProviders.reduce((sum, ap) => {
      return sum + ap.savedProvider.assignedOperatories.filter(ao => ao.savedOperatory.isActive).length;
    }, 0);
    console.log(`   Active Operatories: ${activeOperatories}`);

    // Check for potential issues
    console.log(`\n⚠️  POTENTIAL ISSUES:`);
    if (appointmentType.acceptedByProviders.length === 0) {
      console.log(`   🔴 CRITICAL: No providers configured for this appointment type!`);
    }
    
    if (activeProviders.length === 0) {
      console.log(`   🔴 CRITICAL: No active providers for this appointment type!`);
    }
    
    if (totalOperatories === 0) {
      console.log(`   🔴 CRITICAL: No operatories assigned to any providers!`);
    }
    
    if (activeOperatories === 0) {
      console.log(`   🔴 CRITICAL: No active operatories available!`);
    }
    
    const providersWithoutOperatories = appointmentType.acceptedByProviders.filter(ap => 
      ap.savedProvider.assignedOperatories.length === 0
    );
    if (providersWithoutOperatories.length > 0) {
      console.log(`   🟡 WARNING: ${providersWithoutOperatories.length} provider(s) have no operatories assigned!`);
    }

    if (appointmentType.acceptedByProviders.length > 0 && 
        activeProviders.length > 0 && 
        activeOperatories > 0) {
      console.log(`   ✅ Configuration looks good for booking!`);
    }

  } catch (error) {
    console.error('❌ Error checking appointment dependencies:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get the NexHealth appointment type ID from command line arguments
const nexhealthAppointmentTypeId = process.argv[2];

if (!nexhealthAppointmentTypeId) {
  console.log('❌ Please provide a NexHealth appointment type ID');
  console.log('Usage: node scripts/check-appointment-dependencies.js <nexhealth_appointment_type_id>');
  process.exit(1);
}

checkAppointmentDependencies(nexhealthAppointmentTypeId); 