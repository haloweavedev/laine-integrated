#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(header => header.replace(/"/g, '').trim());
  
  return lines.slice(1).map(line => {
    const values = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim()); // Add the last value
    
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    return record;
  });
}

async function readCSVData() {
  const csvPath = path.join(__dirname, 'Expanded_Appointment_Types_with_All_Consultations.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  const records = parseCSV(csvContent);

  return records.map(record => {
    let keywords = null;
    try {
      // Parse the keywords field which is a JSON array string
      const keywordsStr = record['Keywords'];
      if (keywordsStr && keywordsStr.trim().startsWith('[')) {
        // More robust parsing: extract keywords manually
        // Remove the brackets and split by ', '
        const content = keywordsStr.slice(1, -1); // Remove [ and ]
        const keywordArray = [];
        
        let current = '';
        let inQuotes = false;
        let quoteChar = null;
        
        for (let i = 0; i < content.length; i++) {
          const char = content[i];
          const nextChar = content[i + 1];
          
          if ((char === "'" || char === '"') && !inQuotes) {
            inQuotes = true;
            quoteChar = char;
          } else if (char === quoteChar && inQuotes) {
            // Check if this is an escaped quote
            if (nextChar === quoteChar) {
              current += char;
              i++; // Skip the next character
            } else {
              inQuotes = false;
              quoteChar = null;
            }
          } else if (char === ',' && !inQuotes && nextChar === ' ') {
            keywordArray.push(current.trim());
            current = '';
            i++; // Skip the space after comma
          } else if (!(char === ',' && !inQuotes)) {
            current += char;
          }
        }
        
        if (current.trim()) {
          keywordArray.push(current.trim());
        }
        
        keywords = keywordArray;
      }
    } catch (error) {
      console.warn(`Failed to parse keywords for "${record['Written Name']}":`, error.message);
    }

    return {
      name: record['Written Name'],
      spokenName: record['Spoken Name'],
      duration: parseInt(record['Appointment Length (Minutes)']),
      keywords: keywords ? JSON.stringify(keywords) : null,
      // Generate a unique nexhealth ID based on the name
      nexhealthAppointmentTypeId: `seed_${record['Written Name'].toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
    };
  });
}

async function seedAppointmentTypes(practiceId) {
  console.log('🌱 Starting appointment types seeding...');
  
  if (!practiceId) {
    console.error('❌ Error: practiceId is required');
    console.log('Usage: node seed-appointment-types.js <practiceId>');
    console.log('Or set PRACTICE_ID environment variable');
    process.exit(1);
  }

  try {
    // Verify practice exists
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId }
    });

    if (!practice) {
      console.error(`❌ Error: Practice with ID "${practiceId}" not found`);
      process.exit(1);
    }

    console.log(`📋 Found practice: ${practice.name || practice.id}`);

    // Read CSV data
    const appointmentTypesData = await readCSVData();
    console.log(`📄 Read ${appointmentTypesData.length} appointment types from CSV`);

    // Check for existing appointment types to avoid duplicates
    const existingTypes = await prisma.appointmentType.findMany({
      where: { 
        practiceId,
        nexhealthAppointmentTypeId: {
          in: appointmentTypesData.map(apt => apt.nexhealthAppointmentTypeId)
        }
      }
    });

    console.log(`🔍 Found ${existingTypes.length} existing appointment types`);

    let createdCount = 0;
    let updatedCount = 0;

    for (const aptData of appointmentTypesData) {
      const existing = existingTypes.find(
        apt => apt.nexhealthAppointmentTypeId === aptData.nexhealthAppointmentTypeId
      );

      if (existing) {
        // Update existing appointment type
        await prisma.appointmentType.update({
          where: { id: existing.id },
          data: {
            name: aptData.name,
            spokenName: aptData.spokenName,
            duration: aptData.duration,
            keywords: aptData.keywords,
            bookableOnline: true, // Default to bookable online
            check_immediate_next_available: true // Default to checking immediate availability
          }
        });
        updatedCount++;
        console.log(`✏️  Updated: ${aptData.name}`);
      } else {
        // Create new appointment type
        await prisma.appointmentType.create({
          data: {
            practiceId,
            nexhealthAppointmentTypeId: aptData.nexhealthAppointmentTypeId,
            name: aptData.name,
            spokenName: aptData.spokenName,
            duration: aptData.duration,
            keywords: aptData.keywords,
            bookableOnline: true, // Default to bookable online
            check_immediate_next_available: true // Default to checking immediate availability
          }
        });
        createdCount++;
        console.log(`✅ Created: ${aptData.name}`);
      }
    }

    console.log('\n🎉 Seeding completed!');
    console.log(`📊 Summary:`);
    console.log(`   • Created: ${createdCount} appointment types`);
    console.log(`   • Updated: ${updatedCount} appointment types`);
    console.log(`   • Total processed: ${appointmentTypesData.length}`);

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function listPractices() {
  console.log('🏥 Available practices:');
  console.log('=====================\n');

  try {
    const practices = await prisma.practice.findMany({
      select: {
        id: true,
        name: true,
        clerkUserId: true,
        nexhealthSubdomain: true,
        _count: {
          select: {
            appointmentTypes: true
          }
        }
      }
    });

    if (practices.length === 0) {
      console.log('No practices found in the database.');
      console.log('You may need to create a practice first.');
    } else {
      practices.forEach(practice => {
        console.log(`• ID: ${practice.id}`);
        console.log(`  Name: ${practice.name || 'N/A'}`);
        console.log(`  Subdomain: ${practice.nexhealthSubdomain || 'N/A'}`);
        console.log(`  Current appointment types: ${practice._count.appointmentTypes}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error listing practices:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const practiceId = args[0] || process.env.PRACTICE_ID;

  if (args[0] === '--list' || args[0] === '-l') {
    await listPractices();
    return;
  }

  if (!practiceId) {
    console.log('🌱 Appointment Types Seeder');
    console.log('===========================\n');
    console.log('Usage:');
    console.log('  node seed-appointment-types.js <practiceId>');
    console.log('  node seed-appointment-types.js --list    # List available practices');
    console.log('  PRACTICE_ID=<id> node seed-appointment-types.js');
    console.log('');
    await listPractices();
    return;
  }

  await seedAppointmentTypes(practiceId);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { seedAppointmentTypes, readCSVData }; 