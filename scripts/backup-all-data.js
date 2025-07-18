#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function createLocalBackup() {
  console.log('💾 Creating Local Data Backup');
  console.log('=============================\n');

  try {
    // Create backup directory with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(__dirname, 'backups', `backup-${timestamp}`);
    
    if (!fs.existsSync(path.join(__dirname, 'backups'))) {
      fs.mkdirSync(path.join(__dirname, 'backups'));
    }
    fs.mkdirSync(backupDir);

    console.log(`📁 Backup directory: ${backupDir}\n`);

    // Find the practice
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
        savedOperatories: true,
        nexhealthWebhookSubscriptions: true,
        assistantConfig: true,
        callLogs: {
          orderBy: { createdAt: 'desc' },
          take: 100 // Limit to last 100 call logs to avoid huge files
        },
        toolLogs: {
          orderBy: { createdAt: 'desc' },
          take: 500 // Limit to last 500 tool logs
        }
      }
    });

    if (!practice) {
      console.error('❌ No practice found');
      return;
    }

    console.log(`📋 Practice: ${practice.name}`);
    console.log(`🆔 Practice ID: ${practice.id}\n`);

    // 1. Export Practice Configuration
    console.log('💼 Backing up practice configuration...');
    const practiceConfig = {
      id: practice.id,
      clerkUserId: practice.clerkUserId,
      name: practice.name,
      nexhealthSubdomain: practice.nexhealthSubdomain,
      nexhealthLocationId: practice.nexhealthLocationId,
      address: practice.address,
      acceptedInsurances: practice.acceptedInsurances,
      serviceCostEstimates: practice.serviceCostEstimates,
      timezone: practice.timezone,
      lunchBreakStart: practice.lunchBreakStart,
      lunchBreakEnd: practice.lunchBreakEnd,
      minBookingBufferMinutes: practice.minBookingBufferMinutes,
      webhookLastSyncAt: practice.webhookLastSyncAt,
      webhookLastSuccessfulSyncAt: practice.webhookLastSuccessfulSyncAt,
      webhookSyncErrorMsg: practice.webhookSyncErrorMsg,
      createdAt: practice.createdAt,
      updatedAt: practice.updatedAt
    };
    fs.writeFileSync(
      path.join(backupDir, 'practice-config.json'),
      JSON.stringify(practiceConfig, null, 2)
    );

    // 2. Export Appointment Types
    console.log('📅 Backing up appointment types...');
    const appointmentTypes = practice.appointmentTypes.map(apt => ({
      id: apt.id,
      nexhealthAppointmentTypeId: apt.nexhealthAppointmentTypeId,
      name: apt.name,
      duration: apt.duration,
      bookableOnline: apt.bookableOnline,
      spokenName: apt.spokenName,
      check_immediate_next_available: apt.check_immediate_next_available,
      keywords: apt.keywords,
      parentType: apt.parentType,
      parentId: apt.parentId,
      lastSyncError: apt.lastSyncError,
      createdAt: apt.createdAt,
      updatedAt: apt.updatedAt
    }));
    fs.writeFileSync(
      path.join(backupDir, 'appointment-types.json'),
      JSON.stringify(appointmentTypes, null, 2)
    );

    // 3. Export Providers (raw from NexHealth)
    console.log('👥 Backing up providers...');
    const providers = practice.providers.map(provider => ({
      id: provider.id,
      nexhealthProviderId: provider.nexhealthProviderId,
      firstName: provider.firstName,
      lastName: provider.lastName,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt
    }));
    fs.writeFileSync(
      path.join(backupDir, 'providers.json'),
      JSON.stringify(providers, null, 2)
    );

    // 4. Export Saved Providers (active providers with configurations)
    console.log('⚙️  Backing up saved providers configuration...');
    const savedProviders = practice.savedProviders.map(savedProvider => ({
      id: savedProvider.id,
      providerId: savedProvider.providerId,
      isActive: savedProvider.isActive,
      provider: {
        nexhealthProviderId: savedProvider.provider.nexhealthProviderId,
        firstName: savedProvider.provider.firstName,
        lastName: savedProvider.provider.lastName
      },
      acceptedAppointmentTypes: savedProvider.acceptedAppointmentTypes.map(apt => ({
        appointmentTypeId: apt.appointmentTypeId,
        appointmentTypeName: apt.appointmentType.name,
        createdAt: apt.createdAt
      })),
      assignedOperatories: savedProvider.assignedOperatories.map(op => ({
        savedOperatoryId: op.savedOperatoryId,
        operatoryName: op.savedOperatory.name,
        nexhealthOperatoryId: op.savedOperatory.nexhealthOperatoryId,
        createdAt: op.createdAt
      })),
      createdAt: savedProvider.createdAt,
      updatedAt: savedProvider.updatedAt
    }));
    fs.writeFileSync(
      path.join(backupDir, 'saved-providers.json'),
      JSON.stringify(savedProviders, null, 2)
    );

    // 5. Export Operatories
    console.log('🏥 Backing up operatories...');
    const operatories = practice.savedOperatories.map(operatory => ({
      id: operatory.id,
      nexhealthOperatoryId: operatory.nexhealthOperatoryId,
      name: operatory.name,
      isActive: operatory.isActive,
      createdAt: operatory.createdAt,
      updatedAt: operatory.updatedAt
    }));
    fs.writeFileSync(
      path.join(backupDir, 'operatories.json'),
      JSON.stringify(operatories, null, 2)
    );

    // 6. Export Webhook Configuration
    console.log('🔗 Backing up webhook configuration...');
    const webhookConfig = {
      subscriptions: practice.nexhealthWebhookSubscriptions.map(sub => ({
        id: sub.id,
        nexhealthWebhookEndpointId: sub.nexhealthWebhookEndpointId,
        nexhealthSubscriptionId: sub.nexhealthSubscriptionId,
        resourceType: sub.resourceType,
        eventName: sub.eventName,
        isActive: sub.isActive,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt
      }))
    };

    // Get global webhook endpoint
    const globalWebhookEndpoint = await prisma.globalNexhealthWebhookEndpoint.findUnique({
      where: { id: "singleton" }
    });
    
    if (globalWebhookEndpoint) {
      webhookConfig.globalEndpoint = {
        nexhealthEndpointId: globalWebhookEndpoint.nexhealthEndpointId,
        targetUrl: globalWebhookEndpoint.targetUrl,
        isEnabled: globalWebhookEndpoint.isEnabled,
        createdAt: globalWebhookEndpoint.createdAt,
        updatedAt: globalWebhookEndpoint.updatedAt
        // Note: secretKey intentionally excluded for security
      };
    }

    fs.writeFileSync(
      path.join(backupDir, 'webhook-config.json'),
      JSON.stringify(webhookConfig, null, 2)
    );

    // 7. Export Assistant Configuration
    console.log('🤖 Backing up assistant configuration...');
    const assistantConfig = practice.assistantConfig ? {
      vapiAssistantId: practice.assistantConfig.vapiAssistantId,
      voiceProvider: practice.assistantConfig.voiceProvider,
      voiceId: practice.assistantConfig.voiceId,
      systemPrompt: practice.assistantConfig.systemPrompt,
      firstMessage: practice.assistantConfig.firstMessage,
      createdAt: practice.assistantConfig.createdAt,
      updatedAt: practice.assistantConfig.updatedAt
    } : null;

    fs.writeFileSync(
      path.join(backupDir, 'assistant-config.json'),
      JSON.stringify(assistantConfig, null, 2)
    );

    // 8. Export Recent Call Logs (limited to last 100)
    console.log('📞 Backing up recent call logs...');
    const callLogs = practice.callLogs.map(call => ({
      id: call.id,
      vapiCallId: call.vapiCallId,
      callTimestampStart: call.callTimestampStart,
      callStatus: call.callStatus,
      summary: call.summary,
      detectedIntent: call.detectedIntent,
      nexhealthPatientId: call.nexhealthPatientId,
      bookedAppointmentNexhealthId: call.bookedAppointmentNexhealthId,
      patientStatus: call.patientStatus,
      originalPatientRequestForType: call.originalPatientRequestForType,
      assistantId: call.assistantId,
      endedReason: call.endedReason,
      callDurationSeconds: call.callDurationSeconds,
      cost: call.cost,
      createdAt: call.createdAt,
      updatedAt: call.updatedAt
      // Note: transcriptText excluded to keep file size manageable
    }));
    fs.writeFileSync(
      path.join(backupDir, 'call-logs.json'),
      JSON.stringify(callLogs, null, 2)
    );

    // 9. Export Recent Tool Logs (limited to last 500)
    console.log('🛠️  Backing up recent tool logs...');
    const toolLogs = practice.toolLogs.map(tool => ({
      id: tool.id,
      vapiCallId: tool.vapiCallId,
      toolName: tool.toolName,
      toolCallId: tool.toolCallId,
      success: tool.success,
      error: tool.error,
      executionTimeMs: tool.executionTimeMs,
      createdAt: tool.createdAt,
      updatedAt: tool.updatedAt
      // Note: arguments and result excluded to keep file size manageable
    }));
    fs.writeFileSync(
      path.join(backupDir, 'tool-logs.json'),
      JSON.stringify(toolLogs, null, 2)
    );

    // 10. Create backup summary
    console.log('📋 Creating backup summary...');
    const summary = {
      backupCreatedAt: new Date().toISOString(),
      practiceId: practice.id,
      practiceName: practice.name,
      dataExported: {
        practiceConfig: 1,
        appointmentTypes: appointmentTypes.length,
        providers: providers.length,
        savedProviders: savedProviders.length,
        operatories: operatories.length,
        webhookSubscriptions: webhookConfig.subscriptions.length,
        assistantConfig: assistantConfig ? 1 : 0,
        callLogs: callLogs.length,
        toolLogs: toolLogs.length
      },
      files: [
        'practice-config.json',
        'appointment-types.json',
        'providers.json',
        'saved-providers.json',
        'operatories.json',
        'webhook-config.json',
        'assistant-config.json',
        'call-logs.json',
        'tool-logs.json',
        'backup-summary.json'
      ]
    };

    fs.writeFileSync(
      path.join(backupDir, 'backup-summary.json'),
      JSON.stringify(summary, null, 2)
    );

    // 11. Create README
    console.log('📖 Creating backup README...');
    const readme = `# Laine Practice Data Backup

Created: ${new Date().toLocaleString()}
Practice: ${practice.name}
Practice ID: ${practice.id}

## Files Included:

1. **practice-config.json** - Main practice configuration
2. **appointment-types.json** - All appointment types with keywords and settings
3. **providers.json** - All providers from NexHealth
4. **saved-providers.json** - Active providers with operatory and appointment type assignments
5. **operatories.json** - All operatories with active/inactive status
6. **webhook-config.json** - Webhook subscriptions and global endpoint config
7. **assistant-config.json** - AI assistant configuration (voice, prompts, etc.)
8. **call-logs.json** - Recent call logs (last 100)
9. **tool-logs.json** - Recent tool execution logs (last 500)
10. **backup-summary.json** - Summary of what was backed up

## Data Counts:

- Appointment Types: ${appointmentTypes.length}
- Providers: ${providers.length}
- Active Saved Providers: ${savedProviders.length}
- Operatories: ${operatories.length}
- Webhook Subscriptions: ${webhookConfig.subscriptions.length}
- Recent Call Logs: ${callLogs.length}
- Recent Tool Logs: ${toolLogs.length}

## Security Notes:

- Webhook secret keys are NOT included for security
- Full transcripts are NOT included to keep file sizes manageable
- Tool call arguments/results are NOT included to keep file sizes manageable

## Usage:

These JSON files can be used to:
- Restore your configuration in a new environment
- Analyze your practice data
- Create reports or documentation
- Migrate to a different system
- Debug issues by examining historical data

To load any file in Node.js:
\`\`\`javascript
const data = JSON.parse(fs.readFileSync('appointment-types.json', 'utf8'));
\`\`\`
`;

    fs.writeFileSync(path.join(backupDir, 'README.md'), readme);

    console.log('\n🎉 Backup completed successfully!');
    console.log('=' .repeat(80));
    console.log(`📁 Backup location: ${backupDir}`);
    console.log(`📋 Practice: ${practice.name}`);
    console.log(`📊 Data backed up:`);
    console.log(`   • Practice configuration: 1`);
    console.log(`   • Appointment types: ${appointmentTypes.length}`);
    console.log(`   • Providers: ${providers.length}`);
    console.log(`   • Saved providers: ${savedProviders.length}`);
    console.log(`   • Operatories: ${operatories.length}`);
    console.log(`   • Webhook subscriptions: ${webhookConfig.subscriptions.length}`);
    console.log(`   • Assistant config: ${assistantConfig ? 1 : 0}`);
    console.log(`   • Call logs: ${callLogs.length}`);
    console.log(`   • Tool logs: ${toolLogs.length}`);
    console.log(`\n📖 See README.md in backup folder for detailed information`);

  } catch (error) {
    console.error('❌ Error creating backup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createLocalBackup(); 