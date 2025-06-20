#!/usr/bin/env node

/**
 * Phase 4.3: Log Analysis and Debugging
 * 
 * Detailed analysis of tool execution logs, call flows, and system performance
 * to identify patterns, issues, and optimization opportunities.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeToolExecutionPatterns() {
  console.log('🔍 Phase 4.3: Tool Execution Pattern Analysis');
  console.log('=============================================\n');
  
  try {
    // Get tool execution statistics
    const toolStats = await prisma.toolLog.groupBy({
      by: ['toolName'],
      _count: { id: true },
      _avg: { executionTimeMs: true },
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      }
    });
    
    console.log('📊 Tool Usage Statistics (Last 7 Days):');
    console.log('Tool Name | Count | Avg Time (ms)');
    console.log('---------|-------|---------------');
    
    const totalExecutions = toolStats.reduce((sum, stat) => sum + stat._count.id, 0);
    
    toolStats
      .sort((a, b) => b._count.id - a._count.id)
      .forEach(stat => {
        const avgTime = stat._avg.executionTimeMs ? Math.round(stat._avg.executionTimeMs) : 'N/A';
        console.log(`${stat.toolName.padEnd(8)} | ${stat._count.id.toString().padEnd(5)} | ${avgTime.toString().padEnd(13)}`);
      });

    // Analyze success rates
    const successRates = await prisma.toolLog.groupBy({
      by: ['toolName', 'success'],
      _count: { id: true },
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    });
    
    console.log('\n✅ Tool Success Rates:');
    const toolSuccessMap = new Map();
    
    successRates.forEach(rate => {
      if (!toolSuccessMap.has(rate.toolName)) {
        toolSuccessMap.set(rate.toolName, { success: 0, total: 0 });
      }
      const tool = toolSuccessMap.get(rate.toolName);
      tool.total += rate._count.id;
      if (rate.success) {
        tool.success += rate._count.id;
      }
    });
    
    Array.from(toolSuccessMap.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([toolName, stats]) => {
        const successRate = ((stats.success / stats.total) * 100).toFixed(1);
        const status = parseFloat(successRate) >= 95 ? '✅' : parseFloat(successRate) >= 80 ? '⚠️' : '❌';
        console.log(`${status} ${toolName}: ${successRate}% (${stats.success}/${stats.total})`);
      });

    return { toolStats, successRates, totalExecutions };
    
  } catch (error) {
    console.error('❌ Error analyzing tool patterns:', error);
    return null;
  }
}

async function analyzeCallFlows() {
  console.log('\n📞 Call Flow Analysis');
  console.log('=====================\n');
  
  try {
    // Get recent calls with their tool usage
    const callsWithTools = await prisma.callLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        practice: { select: { name: true } }
      }
    });
    
    console.log('📋 Recent Call Flows:');
    
    for (const call of callsWithTools) {
      console.log(`\n🔸 Call ${call.vapiCallId}:`);
      console.log(`   Practice: ${call.practice.name}`);
      console.log(`   Status: ${call.callStatus}`);
      console.log(`   Started: ${call.callTimestampStart?.toISOString() || 'Unknown'}`);
      
      if (call.nexhealthPatientId) {
        console.log(`   Patient ID: ${call.nexhealthPatientId}`);
      }
      
      if (call.lastAppointmentTypeName) {
        console.log(`   Appointment Type: ${call.lastAppointmentTypeName}`);
      }
      
      const toolsInCall = await prisma.toolLog.findMany({
        where: { vapiCallId: call.vapiCallId },
        orderBy: { createdAt: 'asc' },
        select: {
          toolName: true,
          success: true,
          createdAt: true,
          errorMessage: true
        }
      });
      
      if (toolsInCall.length > 0) {
        console.log('   Tool Sequence:');
        toolsInCall.forEach((tool, index) => {
          const status = tool.success ? '✅' : '❌';
          const time = tool.createdAt.toTimeString().split(' ')[0];
          console.log(`     ${index + 1}. ${status} ${tool.toolName} (${time})`);
          if (!tool.success && tool.errorMessage) {
            console.log(`        Error: ${tool.errorMessage.substring(0, 100)}...`);
          }
        });
      }
    }
    
    return callsWithTools;
    
  } catch (error) {
    console.error('❌ Error analyzing call flows:', error);
    return null;
  }
}

async function analyzeErrorPatterns() {
  console.log('\n🚨 Error Pattern Analysis');
  console.log('=========================\n');
  
  try {
    // Get recent errors
    const recentErrors = await prisma.toolLog.findMany({
      where: {
        success: false,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        toolName: true,
        errorMessage: true,
        createdAt: true,
        vapiCallId: true
      }
    });
    
    if (recentErrors.length === 0) {
      console.log('✅ No recent errors found! System is performing well.');
      return [];
    }
    
    console.log('📋 Recent Errors:');
    recentErrors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.toolName} - ${error.createdAt.toISOString()}`);
      console.log(`   Error: ${error.errorMessage?.substring(0, 100) || 'Unknown error'}...`);
    });
    
    return recentErrors;
    
  } catch (error) {
    console.error('❌ Error analyzing error patterns:', error);
    return null;
  }
}

async function analyzeDynamicMessages() {
  console.log('\n💬 Dynamic Message Analysis');
  console.log('===========================\n');
  
  try {
    // Get recent tool executions with their results to analyze message quality
    const recentTools = await prisma.toolLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      select: {
        toolName: true,
        success: true,
        result: true,
        createdAt: true,
        executionTimeMs: true
      }
    });
    
    console.log('📊 Recent Tool Executions with Message Analysis:');
    
    recentTools.forEach((tool, index) => {
      console.log(`\n${index + 1}. ${tool.toolName} (${tool.success ? '✅' : '❌'})`);
      console.log(`   Time: ${tool.createdAt.toISOString()}`);
      console.log(`   Duration: ${tool.executionTimeMs || 'N/A'}ms`);
      
      // Try to extract message from result
      try {
        const result = typeof tool.result === 'string' ? JSON.parse(tool.result) : tool.result;
        if (result && result.message_to_patient) {
          console.log(`   Message: "${result.message_to_patient}"`);
          
          // Analyze message quality
          const message = result.message_to_patient;
          const messageQuality = analyzeMessageQuality(message);
          if (messageQuality.issues.length > 0) {
            console.log(`   ⚠️ Message Issues: ${messageQuality.issues.join(', ')}`);
          }
        }
      } catch (e) {
        // Result might not be parseable JSON
      }
    });
    
    return recentTools;
    
  } catch (error) {
    console.error('❌ Error analyzing dynamic messages:', error);
    return null;
  }
}

function analyzeMessageQuality(message) {
  const issues = [];
  
  if (!message || message.trim().length === 0) {
    issues.push('Empty message');
  } else {
    if (message.length > 200) {
      issues.push('Message too long');
    }
    if (message.includes('I will now execute')) {
      issues.push('Robotic language');
    }
    if (!message.endsWith('.') && !message.endsWith('?') && !message.endsWith('!')) {
      issues.push('Missing punctuation');
    }
    if (message.includes('undefined') || message.includes('null')) {
      issues.push('Contains undefined values');
    }
  }
  
  return { issues };
}

function generateOptimizationRecommendations(toolStats, errorAnalysis) {
  console.log('\n🎯 Optimization Recommendations');
  console.log('===============================\n');
  
  const recommendations = [];
  
  // Analyze tool performance
  if (toolStats) {
    const slowTools = toolStats.toolStats.filter(tool => 
      tool._avg.executionTimeMs && tool._avg.executionTimeMs > 5000
    );
    
    if (slowTools.length > 0) {
      recommendations.push(`Performance: Optimize slow tools (${slowTools.map(t => t.toolName).join(', ')})`);
    }
  }
  
  // Analyze error patterns
  if (errorAnalysis && errorAnalysis.length > 0) {
    recommendations.push(`Reliability: Address error patterns (${errorAnalysis.length} recent errors)`);
  }
  
  if (recommendations.length === 0) {
    console.log('✅ No optimization opportunities identified!');
    console.log('   System is performing well across all metrics.');
  } else {
    console.log('📋 Identified Optimization Opportunities:');
    recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });
  }
  
  return recommendations;
}

async function runPhase43Analysis() {
  console.log('🚀 Phase 4.3: Log Analysis and Debugging');
  console.log('========================================\n');
  
  try {
    const toolStats = await prisma.toolLog.groupBy({
      by: ['toolName'],
      _count: { id: true },
      _avg: { executionTimeMs: true }
    });
    
    console.log('📊 Tool Usage Statistics:');
    toolStats.forEach(stat => {
      const avgTime = stat._avg.executionTimeMs ? Math.round(stat._avg.executionTimeMs) : 'N/A';
      console.log(`${stat.toolName}: ${stat._count.id} executions, avg ${avgTime}ms`);
    });
    
    const recentErrors = await prisma.toolLog.findMany({
      where: { success: false },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('\n🚨 Recent Errors:');
    if (recentErrors.length === 0) {
      console.log('✅ No recent errors found!');
    } else {
      recentErrors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.toolName}: ${error.errorMessage}`);
      });
    }
    
    console.log('\n✅ Phase 4.3 Analysis Complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the analysis
runPhase43Analysis(); 