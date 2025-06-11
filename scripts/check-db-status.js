const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Testing database connection...\n');
    
    // Test basic connection
    const startTime = Date.now();
    await prisma.$connect();
    const connectionTime = Date.now() - startTime;
    console.log('✅ Database connection successful');
    console.log('⏱️  Connection time:', connectionTime + 'ms\n');
    
    // Get database info
    const dbInfo = await prisma.$queryRaw`SELECT version() as version`;
    console.log('📊 Database Info:');
    console.log('   Version:', dbInfo[0].version);
    
    // Test table counts
    console.log('\n📋 Table Status:');
    const tables = [
      { name: 'Practice', query: prisma.practice.count() },
      { name: 'CallLog', query: prisma.callLog.count() },
      { name: 'ToolLog', query: prisma.toolLog.count() },
      { name: 'AppointmentType', query: prisma.appointmentType.count() },
      { name: 'Provider', query: prisma.provider.count() },
      { name: 'SavedProvider', query: prisma.savedProvider.count() },
      { name: 'SavedOperatory', query: prisma.savedOperatory.count() },
      { name: 'NexhealthWebhookSubscription', query: prisma.nexhealthWebhookSubscription.count() },
      { name: 'PracticeAssistantConfig', query: prisma.practiceAssistantConfig.count() },
      { name: 'GlobalNexhealthWebhookEndpoint', query: prisma.globalNexhealthWebhookEndpoint.count() }
    ];
    
    const counts = await Promise.all(tables.map(t => t.query.catch(() => 0)));
    
    tables.forEach((table, i) => {
      console.log('   ' + table.name.padEnd(30) + counts[i] + ' records');
    });
    
    // Test recent activity
    console.log('\n📈 Recent Activity:');
    const recentCallLogs = await prisma.callLog.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });
    
    const recentToolLogs = await prisma.toolLog.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });
    
    console.log('   Call logs (24h):', recentCallLogs);
    console.log('   Tool logs (24h):', recentToolLogs);
    
    // Test webhook status
    const globalWebhook = await prisma.globalNexhealthWebhookEndpoint.findUnique({
      where: { id: 'singleton' }
    });
    
    console.log('\n🔗 Webhook Status:');
    if (globalWebhook) {
      console.log('   Global webhook: ✅ Active');
      console.log('   Endpoint ID:', globalWebhook.nexhealthEndpointId);
      console.log('   Target URL:', globalWebhook.targetUrl);
      console.log('   Enabled:', globalWebhook.isEnabled ? '✅' : '❌');
    } else {
      console.log('   Global webhook: ❌ Not configured');
    }
    
    const activeSubscriptions = await prisma.nexhealthWebhookSubscription.count({
      where: { isActive: true }
    });
    console.log('   Active subscriptions:', activeSubscriptions);
    
    // Check for any recent errors in tool logs
    const recentErrors = await prisma.toolLog.count({
      where: {
        success: false,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });
    
    console.log('\n⚠️  Error Tracking:');
    console.log('   Failed tool calls (24h):', recentErrors);
    
    // Most active tools
    const toolStats = await prisma.toolLog.groupBy({
      by: ['toolName'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 5
    });
    
    console.log('\n🛠️  Most Used Tools:');
    toolStats.forEach(stat => {
      console.log('   ' + stat.toolName.padEnd(25) + stat._count.id + ' calls');
    });
    
    console.log('\n🎯 System Health: ✅ OPERATIONAL');
    
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error(error.message);
    console.log('\n🎯 System Health: ❌ DEGRADED');
    
    // Check if it's a connection issue
    if (error.message.includes('connect') || error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   • Check DATABASE_URL environment variable');
      console.log('   • Verify database server is running');
      console.log('   • Check network connectivity');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkDatabase(); 