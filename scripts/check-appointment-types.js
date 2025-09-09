#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function checkAppointmentTypes() {
  console.log('📋 Generating appointment types markdown file...');
  
  try {
    // Find the practice (more flexible search)
    const practice = await prisma.practice.findFirst({
      where: { 
        OR: [
          { name: { contains: 'Royal Oak', mode: 'insensitive' } },
          { nexhealthSubdomain: { not: null } }
        ]
      },
      include: { 
        appointmentTypes: {
          orderBy: { nexhealthAppointmentTypeId: 'asc' }
        }
      }
    });
    
    if (!practice) {
      console.log('❌ No practice found');
      return;
    }

    if (practice.appointmentTypes.length === 0) {
      console.log('⚠️  No appointment types found. Run NexHealth sync first.');
      return;
    }

    // Build markdown content
    let markdownContent = `# Appointment Types\n\n`;
    markdownContent += `**Practice:** ${practice.name || 'Unnamed'}\n`;
    markdownContent += `**Total Types:** ${practice.appointmentTypes.length}\n`;
    markdownContent += `**Generated:** ${new Date().toLocaleDateString()}\n\n`;
    
    // Create markdown table
    markdownContent += `| Name | Spoken Name | Duration | Keywords |\n`;
    markdownContent += `|------|-------------|----------|----------|\n`;
    
    practice.appointmentTypes.forEach(type => {
      const name = type.name || '';
      const spokenName = type.spokenName || '';
      const duration = type.duration ? `${type.duration} min` : '';
      const keywords = type.keywords || '';
      
      // Escape markdown special characters and handle line breaks
      const escapeMarkdown = (text) => {
        return text.toString()
          .replace(/\|/g, '\\|')
          .replace(/\n/g, ' ')
          .replace(/\r/g, ' ')
          .trim();
      };
      
      markdownContent += `| ${escapeMarkdown(name)} | ${escapeMarkdown(spokenName)} | ${escapeMarkdown(duration)} | ${escapeMarkdown(keywords)} |\n`;
    });

    // Write to file
    const outputPath = path.join(__dirname, '../appointment-types.md');
    fs.writeFileSync(outputPath, markdownContent, 'utf8');
    
    console.log(`✅ Markdown file generated: ${outputPath}`);
    console.log(`📊 Exported ${practice.appointmentTypes.length} appointment types`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('connect')) {
      console.log('💡 Tip: Make sure your database is running and .env is configured correctly');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkAppointmentTypes(); 