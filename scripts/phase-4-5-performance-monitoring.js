#!/usr/bin/env node

/**
 * Phase 4.5: Performance Monitoring
 * 
 * Monitors system performance, response times, and overall health metrics
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzePerformanceMetrics() {
  console.log('🚀 Phase 4.5: Performance Monitoring');
  console.log('===================================\n');
  
  try {
    // Tool execution times
    const performanceStats = await prisma.toolLog.groupBy({
      by: ['toolName'],
      _avg: { executionTimeMs: true },
      _max: { executionTimeMs: true },
      _min: { executionTimeMs: true },
      _count: { id: true },
      where: {
        executionTimeMs: { not: null },
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      }
    });
    
    console.log('⚡ Tool Performance Metrics (Last 7 Days):');
    console.log('Tool Name              | Avg (ms) | Min (ms) | Max (ms) | Count');
    console.log('----------------------|----------|----------|----------|------');
    
    performanceStats
      .sort((a, b) => (b._avg.executionTimeMs || 0) - (a._avg.executionTimeMs || 0))
      .forEach(stat => {
        const avg = stat._avg.executionTimeMs ? Math.round(stat._avg.executionTimeMs) : 'N/A';
        const min = stat._min.executionTimeMs ? Math.round(stat._min.executionTimeMs) : 'N/A';
        const max = stat._max.executionTimeMs ? Math.round(stat._max.executionTimeMs) : 'N/A';
        
        console.log(
          `${stat.toolName.padEnd(20)} | ${avg.toString().padStart(8)} | ${min.toString().padStart(8)} | ${max.toString().padStart(8)} | ${stat._count.id.toString().padStart(5)}`
        );
      });

    // Success rates over time
    const hourlyStats = await prisma.toolLog.groupBy({
      by: ['success'],
      _count: { id: true },
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });
    
    console.log('\n📊 24-Hour Success Rate:');
    const successCount = hourlyStats.find(s => s.success)?._count.id || 0;
    const failureCount = hourlyStats.find(s => !s.success)?._count.id || 0;
    const totalCount = successCount + failureCount;
    const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : 100;
    
    console.log(`   Success: ${successCount} (${successRate}%)`);
    console.log(`   Failures: ${failureCount} (${(100 - parseFloat(successRate)).toFixed(1)}%)`);
    console.log(`   Total: ${totalCount} tool executions`);

    // Database performance
    const dbStats = await analyzeDatabasePerformance();
    
    return { 
      performanceStats, 
      successRate: parseFloat(successRate),
      totalExecutions: totalCount,
      dbStats 
    };
    
  } catch (error) {
    console.error('❌ Error analyzing performance:', error);
    return null;
  }
}

async function analyzeDatabasePerformance() {
  console.log('\n💾 Database Performance:');
  
  try {
    // Check recent call logs
    const recentCalls = await prisma.callLog.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });
    
    // Check tool logs
    const recentTools = await prisma.toolLog.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });
    
    // Check practice configuration
    const practiceCount = await prisma.practice.count();
    const assistantCount = await prisma.practiceAssistantConfig.count();
    
    console.log(`   Call Logs (24h): ${recentCalls}`);
    console.log(`   Tool Logs (24h): ${recentTools}`);
    console.log(`   Total Practices: ${practiceCount}`);
    console.log(`   Assistant Configs: ${assistantCount}`);
    
    return {
      recentCalls,
      recentTools,
      practiceCount,
      assistantCount
    };
    
  } catch (error) {
    console.error('❌ Error analyzing database performance:', error);
    return null;
  }
}

function generatePerformanceReport(metrics) {
  console.log('\n📈 Performance Report');
  console.log('====================\n');
  
  if (!metrics) {
    console.log('❌ Unable to generate performance report due to analysis errors.');
    return;
  }
  
  const { performanceStats, successRate, totalExecutions, dbStats } = metrics;
  
  console.log('🎯 Performance Summary:');
  console.log(`   • Overall Success Rate: ${successRate}%`);
  console.log(`   • Total Tool Executions (24h): ${totalExecutions}`);
  console.log(`   • Average Response Time: ${calculateAverageResponseTime(performanceStats)}ms`);
  console.log(`   • Database Activity (24h): ${dbStats?.recentCalls || 0} calls, ${dbStats?.recentTools || 0} tools`);
  
  // Performance analysis
  console.log('\n🔍 Performance Analysis:');
  
  if (successRate >= 95) {
    console.log('✅ Excellent success rate - system is very reliable');
  } else if (successRate >= 90) {
    console.log('⚠️ Good success rate - minor improvements possible');
  } else {
    console.log('❌ Success rate needs improvement - investigate errors');
  }
  
  // Identify slow tools
  const slowTools = performanceStats.filter(tool => 
    tool._avg.executionTimeMs && tool._avg.executionTimeMs > 3000
  );
  
  if (slowTools.length > 0) {
    console.log('\n⏱️ Performance Bottlenecks:');
    slowTools.forEach(tool => {
      console.log(`   • ${tool.toolName}: ${Math.round(tool._avg.executionTimeMs)}ms average`);
    });
  } else {
    console.log('✅ No significant performance bottlenecks detected');
  }
  
  // System health indicators
  console.log('\n🏥 System Health Indicators:');
  console.log(`   • Tool Execution Volume: ${getVolumeStatus(totalExecutions)}`);
  console.log(`   • Error Rate: ${getErrorRateStatus(successRate)}`);
  console.log(`   • Response Time: ${getResponseTimeStatus(calculateAverageResponseTime(performanceStats))}`);
  
  // Recommendations
  generatePerformanceRecommendations(metrics);
}

function calculateAverageResponseTime(performanceStats) {
  if (!performanceStats || performanceStats.length === 0) return 0;
  
  let totalTime = 0;
  let totalCount = 0;
  
  performanceStats.forEach(stat => {
    if (stat._avg.executionTimeMs) {
      totalTime += stat._avg.executionTimeMs * stat._count.id;
      totalCount += stat._count.id;
    }
  });
  
  return totalCount > 0 ? Math.round(totalTime / totalCount) : 0;
}

function getVolumeStatus(executions) {
  if (executions > 100) return '🟢 High - Good activity';
  if (executions > 20) return '🟡 Medium - Normal activity';
  return '🔴 Low - Limited activity';
}

function getErrorRateStatus(successRate) {
  if (successRate >= 95) return '🟢 Excellent (<5% errors)';
  if (successRate >= 90) return '🟡 Good (5-10% errors)';
  return '🔴 Needs attention (>10% errors)';
}

function getResponseTimeStatus(avgTime) {
  if (avgTime < 1000) return '🟢 Fast (<1s)';
  if (avgTime < 3000) return '🟡 Acceptable (1-3s)';
  return '🔴 Slow (>3s)';
}

function generatePerformanceRecommendations(metrics) {
  console.log('\n🎯 Performance Recommendations:');
  
  const { successRate, performanceStats } = metrics;
  const avgResponseTime = calculateAverageResponseTime(performanceStats);
  
  const recommendations = [];
  
  if (successRate < 95) {
    recommendations.push('Investigate and fix error patterns to improve reliability');
  }
  
  if (avgResponseTime > 2000) {
    recommendations.push('Optimize slow tools and API calls for better response times');
  }
  
  const slowTools = performanceStats.filter(tool => 
    tool._avg.executionTimeMs && tool._avg.executionTimeMs > 3000
  );
  
  if (slowTools.length > 0) {
    recommendations.push(`Optimize slow tools: ${slowTools.map(t => t.toolName).join(', ')}`);
  }
  
  if (recommendations.length === 0) {
    console.log('✅ System is performing excellently! No recommendations at this time.');
    console.log('   Continue monitoring and maintain current performance levels.');
  } else {
    recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`);
    });
  }
}

async function runPhase45Monitoring() {
  console.log('🚀 Phase 4.5: Performance Monitoring');
  console.log('===================================\n');
  
  try {
    const metrics = await analyzePerformanceMetrics();
    generatePerformanceReport(metrics);
    
    console.log('\n✅ Phase 4.5 Monitoring Complete!');
    console.log('\nNext Steps:');
    console.log('1. Address any performance recommendations');
    console.log('2. Continue monitoring system health');
    console.log('3. Proceed to Phase 4.6 - Final Code Review');
    
  } catch (error) {
    console.error('❌ Error in Phase 4.5 monitoring:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase45Monitoring(); 