#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// 🔧 CONFIGURATION - Change this to target a specific user
const TARGET_CLERK_USER_ID = "user_2yKTSzqIq9w0isdwpDZreVoAazr"; // ⚠️ CHANGE THIS TO YOUR TARGET USER ID

async function exportAppointmentTypes() {
  console.log('📋 Exporting appointment types for migration...');
  console.log(`🎯 Target User ID: ${TARGET_CLERK_USER_ID}`);
  
  try {
    // Find the practice by specific clerkUserId
    const practice = await prisma.practice.findUnique({
      where: { 
        clerkUserId: TARGET_CLERK_USER_ID
      },
      include: { 
        appointmentTypes: {
          orderBy: { name: 'asc' }
        }
      }
    });
    
    if (!practice) {
      console.log(`❌ No practice found for user ID: ${TARGET_CLERK_USER_ID}`);
      console.log('💡 Available user IDs:');
      const allPractices = await prisma.practice.findMany({
        select: { clerkUserId: true, name: true, nexhealthSubdomain: true }
      });
      allPractices.forEach(p => {
        console.log(`   - ${p.clerkUserId} (${p.name || 'Unnamed'} - ${p.nexhealthSubdomain})`);
      });
      return;
    }

    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      console.log('⚠️  Practice found but missing NexHealth configuration');
      console.log(`   - Subdomain: ${practice.nexhealthSubdomain || 'MISSING'}`);
      console.log(`   - Location ID: ${practice.nexhealthLocationId || 'MISSING'}`);
      return;
    }

    if (practice.appointmentTypes.length === 0) {
      console.log('⚠️  No appointment types found for this practice.');
      return;
    }

    console.log(`✅ Found practice: ${practice.name || 'Unnamed'}`);
    console.log(`   - NexHealth Subdomain: ${practice.nexhealthSubdomain}`);
    console.log(`   - Location ID: ${practice.nexhealthLocationId}`);
    console.log(`   - Appointment Types: ${practice.appointmentTypes.length}`);

    // Build comprehensive markdown content
    let markdownContent = `# Appointment Types Migration Data\n\n`;
    markdownContent += `## Practice Information\n`;
    markdownContent += `- **Practice Name:** ${practice.name || 'Unnamed'}\n`;
    markdownContent += `- **Clerk User ID:** ${practice.clerkUserId}\n`;
    markdownContent += `- **NexHealth Subdomain:** ${practice.nexhealthSubdomain}\n`;
    markdownContent += `- **NexHealth Location ID:** ${practice.nexhealthLocationId}\n`;
    markdownContent += `- **Total Types:** ${practice.appointmentTypes.length}\n`;
    markdownContent += `- **Exported:** ${new Date().toISOString()}\n\n`;

    // Add curl command template
    markdownContent += `## NexHealth API Configuration\n\n`;
    markdownContent += `Base URL: \`https://nexhealth.info\`\n`;
    markdownContent += `Subdomain: \`${practice.nexhealthSubdomain}\`\n`;
    markdownContent += `Location ID: \`${practice.nexhealthLocationId}\`\n\n`;
    markdownContent += `### Sample curl command to create appointment type:\n`;
    markdownContent += `\`\`\`bash\n`;
    markdownContent += `curl --request POST \\\n`;
    markdownContent += `     --url 'https://nexhealth.info/appointment_types?subdomain=${practice.nexhealthSubdomain}' \\\n`;
    markdownContent += `     --header 'accept: application/vnd.Nexhealth+json;version=2' \\\n`;
    markdownContent += `     --header 'authorization: Bearer YOUR_TOKEN_HERE' \\\n`;
    markdownContent += `     --header 'content-type: application/json' \\\n`;
    markdownContent += `     --data '{\n`;
    markdownContent += `       "location_id": ${practice.nexhealthLocationId},\n`;
    markdownContent += `       "appointment_type": {\n`;
    markdownContent += `         "name": "APPOINTMENT_NAME",\n`;
    markdownContent += `         "minutes": DURATION_IN_MINUTES,\n`;
    markdownContent += `         "bookable_online": true,\n`;
    markdownContent += `         "parent_type": "Location",\n`;
    markdownContent += `         "parent_id": ${practice.nexhealthLocationId}\n`;
    markdownContent += `       }\n`;
    markdownContent += `     }'\n`;
    markdownContent += `\`\`\`\n\n`;
    
    // Create comprehensive data table
    markdownContent += `## Complete Appointment Types Data\n\n`;
    markdownContent += `| Field | Description |\n`;
    markdownContent += `|-------|-------------|\n`;
    markdownContent += `| **name** | Display name of appointment type |\n`;
    markdownContent += `| **duration** | Length in minutes |\n`;
    markdownContent += `| **bookableOnline** | Can be booked online |\n`;
    markdownContent += `| **spokenName** | How AI refers to it in conversations |\n`;
    markdownContent += `| **check_immediate_next_available** | Urgent appointment flag |\n`;
    markdownContent += `| **keywords** | AI matching terms (comma-separated) |\n`;
    markdownContent += `| **webPatientStatus** | NEW/RETURNING/BOTH eligibility |\n`;
    markdownContent += `| **nexhealthAppointmentTypeId** | External system ID |\n`;
    markdownContent += `| **parentType** | NexHealth parent type |\n`;
    markdownContent += `| **parentId** | NexHealth parent ID |\n\n`;

    markdownContent += `### Appointment Types Table\n\n`;
    markdownContent += `| Name | Duration | Bookable | Spoken Name | Urgent | Keywords | Patient Status | NexHealth ID | Parent Type | Parent ID | Sync Error | Created | Updated |\n`;
    markdownContent += `|------|----------|----------|-------------|--------|----------|---------------|-------------|-------------|-----------|------------|---------|----------|\n`;
    
    practice.appointmentTypes.forEach(type => {
      // Escape markdown special characters and handle null values
      const escapeMarkdown = (text) => {
        if (text === null || text === undefined) return '';
        return text.toString()
          .replace(/\|/g, '\\|')
          .replace(/\n/g, ' ')
          .replace(/\r/g, ' ')
          .trim();
      };
      
      const formatDate = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString();
      };

      const name = escapeMarkdown(type.name);
      const duration = type.duration ? `${type.duration}min` : '';
      const bookable = type.bookableOnline ? 'Yes' : 'No';
      const spokenName = escapeMarkdown(type.spokenName);
      const urgent = type.check_immediate_next_available ? 'Yes' : 'No';
      const keywords = escapeMarkdown(type.keywords);
      const patientStatus = escapeMarkdown(type.webPatientStatus);
      const nexhealthId = escapeMarkdown(type.nexhealthAppointmentTypeId);
      const parentType = escapeMarkdown(type.parentType);
      const parentId = escapeMarkdown(type.parentId);
      const syncError = type.lastSyncError ? '⚠️' : '✅';
      const created = formatDate(type.createdAt);
      const updated = formatDate(type.updatedAt);
      
      markdownContent += `| ${name} | ${duration} | ${bookable} | ${spokenName} | ${urgent} | ${keywords} | ${patientStatus} | ${nexhealthId} | ${parentType} | ${parentId} | ${syncError} | ${created} | ${updated} |\n`;
    });

    // Add JSON export section for programmatic use
    markdownContent += `\n\n## JSON Export (for programmatic migration)\n\n`;
    markdownContent += `\`\`\`json\n`;
    
    const exportData = {
      practice: {
        clerkUserId: practice.clerkUserId,
        name: practice.name,
        nexhealthSubdomain: practice.nexhealthSubdomain,
        nexhealthLocationId: practice.nexhealthLocationId,
        exportedAt: new Date().toISOString()
      },
      appointmentTypes: practice.appointmentTypes.map(type => ({
        // Core NexHealth fields
        name: type.name,
        duration: type.duration,
        bookableOnline: type.bookableOnline,
        parentType: type.parentType,
        parentId: type.parentId,
        
        // Laine-specific fields
        spokenName: type.spokenName,
        check_immediate_next_available: type.check_immediate_next_available,
        keywords: type.keywords,
        webPatientStatus: type.webPatientStatus,
        
        // Metadata
        nexhealthAppointmentTypeId: type.nexhealthAppointmentTypeId,
        lastSyncError: type.lastSyncError,
        createdAt: type.createdAt,
        updatedAt: type.updatedAt,
        laineId: type.id
      }))
    };
    
    markdownContent += JSON.stringify(exportData, null, 2);
    markdownContent += `\n\`\`\`\n\n`;

    // Add curl commands for each appointment type
    markdownContent += `## Individual curl Commands\n\n`;
    practice.appointmentTypes.forEach((type, index) => {
      markdownContent += `### ${index + 1}. ${type.name}\n\n`;
      markdownContent += `\`\`\`bash\n`;
      markdownContent += `curl --request POST \\\n`;
      markdownContent += `     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \\\n`;
      markdownContent += `     --header 'accept: application/vnd.Nexhealth+json;version=2' \\\n`;
      markdownContent += `     --header 'authorization: Bearer YOUR_TOKEN_HERE' \\\n`;
      markdownContent += `     --header 'content-type: application/json' \\\n`;
      markdownContent += `     --data '{\n`;
      markdownContent += `       "location_id": NEW_LOCATION_ID,\n`;
      markdownContent += `       "appointment_type": {\n`;
      markdownContent += `         "name": "${type.name}",\n`;
      markdownContent += `         "minutes": ${type.duration},\n`;
      markdownContent += `         "bookable_online": ${type.bookableOnline},\n`;
      markdownContent += `         "parent_type": "${type.parentType || 'Location'}",\n`;
      markdownContent += `         "parent_id": NEW_LOCATION_ID\n`;
      markdownContent += `       }\n`;
      markdownContent += `     }'\n`;
      markdownContent += `\`\`\`\n\n`;
    });

    // Write to file with user ID in filename
    const sanitizedUserId = TARGET_CLERK_USER_ID.replace(/[^a-zA-Z0-9]/g, '_');
    const outputPath = path.join(__dirname, `../appointment-types-${sanitizedUserId}.md`);
    fs.writeFileSync(outputPath, markdownContent, 'utf8');
    
    console.log(`\n✅ Export complete!`);
    console.log(`📄 File: ${outputPath}`);
    console.log(`📊 Exported ${practice.appointmentTypes.length} appointment types`);
    console.log(`🔧 Includes NexHealth API configuration and curl commands`);
    console.log(`📋 Ready for migration to any target user/practice`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('connect')) {
      console.log('💡 Tip: Make sure your database is running and .env is configured correctly');
    }
  } finally {
    await prisma.$disconnect();
  }
}

exportAppointmentTypes();
