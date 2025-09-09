#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { createNexhealthAppointmentType } = require('../lib/nexhealth');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// 🔧 CONFIGURATION - Change these to target destination
const TARGET_CLERK_USER_ID = "user_32TGZPWmLemh6NUh8u3nk7qV3nl"; // ⚠️ CHANGE THIS TO DESTINATION USER ID
const SOURCE_EXPORT_FILE = "appointment-types-user_2yKTSzqIq9w0isdwpDZreVoAazr.md"; // ⚠️ CHANGE THIS TO YOUR EXPORT FILE

async function importAppointmentTypes() {
  console.log('📥 Importing appointment types...');
  console.log(`🎯 Target User ID: ${TARGET_CLERK_USER_ID}`);
  console.log(`📄 Source File: ${SOURCE_EXPORT_FILE}`);
  
  try {
    // Find the target practice
    const targetPractice = await prisma.practice.findUnique({
      where: { 
        clerkUserId: TARGET_CLERK_USER_ID
      }
    });
    
    if (!targetPractice) {
      console.log(`❌ No practice found for user ID: ${TARGET_CLERK_USER_ID}`);
      return;
    }

    if (!targetPractice.nexhealthSubdomain || !targetPractice.nexhealthLocationId) {
      console.log('❌ Target practice missing NexHealth configuration');
      return;
    }

    console.log(`✅ Target practice: ${targetPractice.name || 'Unnamed'}`);
    console.log(`   - Subdomain: ${targetPractice.nexhealthSubdomain}`);
    console.log(`   - Location ID: ${targetPractice.nexhealthLocationId}`);

    // Read the export file
    const exportFilePath = path.join(__dirname, `../${SOURCE_EXPORT_FILE}`);
    if (!fs.existsSync(exportFilePath)) {
      console.log(`❌ Export file not found: ${exportFilePath}`);
      console.log('💡 Run export-appointment-types.js first to create the export file');
      return;
    }

    const fileContent = fs.readFileSync(exportFilePath, 'utf8');
    
    // Extract JSON data from markdown
    const jsonMatch = fileContent.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      console.log('❌ Could not find JSON data in export file');
      return;
    }

    const exportData = JSON.parse(jsonMatch[1]);
    console.log(`📊 Found ${exportData.appointmentTypes.length} appointment types to import`);

    let successCount = 0;
    let errorCount = 0;

    // Import each appointment type
    for (const [index, typeData] of exportData.appointmentTypes.entries()) {
      console.log(`\n[${index + 1}/${exportData.appointmentTypes.length}] Creating: ${typeData.name}`);
      
      try {
        // Create in NexHealth first
        const nexhealthResponse = await createNexhealthAppointmentType(
          targetPractice.nexhealthSubdomain,
          targetPractice.nexhealthLocationId,
          {
            name: typeData.name,
            minutes: typeData.duration,
            bookable_online: typeData.bookableOnline,
            parent_type: "Location",
            parent_id: targetPractice.nexhealthLocationId
          }
        );

        console.log(`   ✅ Created in NexHealth with ID: ${nexhealthResponse.id}`);

        // Create in local database
        const localAppointmentType = await prisma.appointmentType.create({
          data: {
            practiceId: targetPractice.id,
            nexhealthAppointmentTypeId: nexhealthResponse.id.toString(),
            name: nexhealthResponse.name,
            duration: nexhealthResponse.minutes,
            bookableOnline: nexhealthResponse.bookable_online,
            spokenName: typeData.spokenName,
            check_immediate_next_available: typeData.check_immediate_next_available || false,
            keywords: typeData.keywords,
            webPatientStatus: typeData.webPatientStatus || 'BOTH',
            parentType: nexhealthResponse.parent_type,
            parentId: nexhealthResponse.parent_id.toString(),
            lastSyncError: null
          }
        });

        console.log(`   ✅ Created locally with ID: ${localAppointmentType.id}`);
        successCount++;

      } catch (error) {
        console.error(`   ❌ Failed to create ${typeData.name}:`, error.message);
        errorCount++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n🎉 Import Summary:`);
    console.log(`   ✅ Successfully imported: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   📊 Total processed: ${exportData.appointmentTypes.length}`);

    if (successCount > 0) {
      console.log(`\n💡 Next steps:`);
      console.log(`   1. Check the practice configuration UI to verify all types were imported correctly`);
      console.log(`   2. Configure provider assignments for the new appointment types`);
      console.log(`   3. Test the AI matching with the imported keywords`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

importAppointmentTypes();
