#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeDynamicMessageQuality() {
  console.log('🚀 Phase 4.4: Dynamic Message Generator Analysis');
  console.log('===============================================\n');
  
  try {
    const recentTools = await prisma.toolLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        toolName: true,
        success: true,
        result: true,
        createdAt: true
      }
    });
    
    console.log('📊 Recent Message Quality Analysis:');
    
    let goodMessages = 0;
    let totalMessages = 0;
    
    recentTools.forEach((tool, index) => {
      try {
        const result = typeof tool.result === 'string' ? JSON.parse(tool.result) : tool.result;
        if (result && result.message_to_patient) {
          totalMessages++;
          const message = result.message_to_patient;
          
          console.log(`${index + 1}. ${tool.toolName} (${tool.success ? '✅' : '❌'})`);
          console.log(`   Message: "${message}"`);
          
          const issues = analyzeMessage(message);
          if (issues.length === 0) {
            console.log(`   ✅ Quality: Good`);
            goodMessages++;
          } else {
            console.log(`   ⚠️ Issues: ${issues.join(', ')}`);
          }
        }
      } catch (e) {
        // Result might not be parseable JSON
      }
    });
    
    const qualityScore = totalMessages > 0 ? ((goodMessages / totalMessages) * 100).toFixed(1) : 0;
    console.log(`\n📈 Quality Score: ${qualityScore}% (${goodMessages}/${totalMessages} good messages)`);
    
    return { goodMessages, totalMessages, qualityScore: parseFloat(qualityScore) };
    
  } catch (error) {
    console.error('❌ Error analyzing message quality:', error);
    return null;
  }
}

function analyzeMessage(message) {
  const issues = [];
  
  if (!message || message.trim().length === 0) {
    issues.push('Empty message');
    return issues;
  }
  
  if (message.includes('I will now execute') || message.includes('Processing')) {
    issues.push('Robotic language');
  }
  
  if (message.length > 200) {
    issues.push('Too long');
  }
  
  if (message.includes('undefined') || message.includes('null')) {
    issues.push('Contains undefined values');
  }
  
  if (!message.match(/[.!?]$/)) {
    issues.push('Missing punctuation');
  }
  
  return issues;
}

function generateRecommendations(qualityScore) {
  console.log('\n🎯 Improvement Recommendations');
  console.log('==============================\n');
  
  if (qualityScore >= 80) {
    console.log('✅ Message quality is good! Minor optimizations:');
    console.log('   • Continue monitoring message patterns');
    console.log('   • Test with edge cases');
  } else if (qualityScore >= 60) {
    console.log('⚠️ Message quality needs improvement:');
    console.log('   • Update system prompt for more natural language');
    console.log('   • Add empathy guidelines');
    console.log('   • Reduce message length');
  } else {
    console.log('❌ Message quality needs significant work:');
    console.log('   • Rewrite dynamic message generator prompt');
    console.log('   • Add specific examples for each tool');
    console.log('   • Implement strict validation');
  }
  
  console.log('\n📝 Suggested Dynamic Message Prompt Improvements:');
  console.log('   1. "Speak naturally as a friendly dental receptionist"');
  console.log('   2. "Never use technical terms like execute or process"');
  console.log('   3. "Keep responses to one sentence under 25 words"');
  console.log('   4. "Start with acknowledgment: Sure, Perfect, Let me check"');
  console.log('   5. "Be empathetic for errors, confident for success"');
}

async function runPhase44Analysis() {
  console.log('🚀 Phase 4.4: Prompt Iteration Analysis');
  console.log('======================================\n');
  
  try {
    const analysisResults = await analyzeDynamicMessageQuality();
    
    if (analysisResults) {
      generateRecommendations(analysisResults.qualityScore);
    }
    
    console.log('\n✅ Phase 4.4 Analysis Complete!');
    console.log('\nNext Steps:');
    console.log('1. Update dynamic message generator prompt in route.ts');
    console.log('2. Test improved prompts with sample scenarios');
    console.log('3. Proceed to Phase 4.5 - Performance Monitoring');
    
  } catch (error) {
    console.error('❌ Error in Phase 4.4 analysis:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase44Analysis();
