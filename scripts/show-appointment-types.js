#!/usr/bin/env node

/**
 * Script to display all AppointmentType records from the database
 * Usage: node scripts/show-appointment-types.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ANSI colors for better terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function formatDuration(minutes) {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

function formatBoolean(value) {
  if (value === null || value === undefined) return colors.dim + 'N/A' + colors.reset;
  return value ? colors.green + '✓' + colors.reset : colors.red + '✗' + colors.reset;
}

function formatDate(date) {
  if (!date) return colors.dim + 'N/A' + colors.reset;
  return new Date(date).toLocaleString();
}

function truncateText(text, maxLength = 50) {
  if (!text) return colors.dim + 'N/A' + colors.reset;
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function printSeparator() {
  console.log(colors.dim + '─'.repeat(120) + colors.reset);
}

function formatProviderName(provider) {
  const firstName = provider.firstName || '';
  const lastName = provider.lastName || '';
  return `${firstName} ${lastName}`.trim() || 'Unknown';
}

function printHeader() {
  console.log();
  console.log(colors.bright + colors.cyan + '📅 APPOINTMENT TYPES DATA' + colors.reset);
  printSeparator();
}

function printAppointmentType(appointmentType, index, total) {
  console.log();
  console.log(colors.bright + `${colors.yellow}[${index + 1}/${total}]${colors.reset} ${colors.white}${appointmentType.name}${colors.reset}`);
  console.log(colors.dim + `ID: ${appointmentType.id}` + colors.reset);
  
  console.log();
  console.log(`${colors.bright}Basic Info:${colors.reset}`);
  console.log(`  Name: ${colors.white}${appointmentType.name}${colors.reset}`);
  console.log(`  Duration: ${colors.cyan}${formatDuration(appointmentType.duration)}${colors.reset}`);
  console.log(`  Online Booking: ${formatBoolean(appointmentType.bookableOnline)}`);
  
  console.log();
  console.log(`${colors.bright}NexHealth Integration:${colors.reset}`);
  console.log(`  NexHealth ID: ${colors.magenta}${appointmentType.nexhealthAppointmentTypeId}${colors.reset}`);
  console.log(`  Practice ID: ${colors.dim}${appointmentType.practiceId}${colors.reset}`);
  
  if (appointmentType.groupCode || appointmentType.keywords || appointmentType.parentType) {
    console.log();
    console.log(`${colors.bright}Classification:${colors.reset}`);
    if (appointmentType.groupCode) {
      console.log(`  Group Code: ${colors.blue}${appointmentType.groupCode}${colors.reset}`);
    }
    if (appointmentType.keywords) {
      console.log(`  Keywords: ${colors.green}${truncateText(appointmentType.keywords, 80)}${colors.reset}`);
    }
    if (appointmentType.parentType) {
      console.log(`  Parent Type: ${colors.yellow}${appointmentType.parentType}${colors.reset}`);
      if (appointmentType.parentId) {
        console.log(`  Parent ID: ${colors.dim}${appointmentType.parentId}${colors.reset}`);
      }
    }
  }
  
  // Display associated providers
  console.log();
  console.log(`${colors.bright}Associated Providers:${colors.reset}`);
  if (appointmentType.acceptedByProviders && appointmentType.acceptedByProviders.length > 0) {
    appointmentType.acceptedByProviders.forEach((providerAccepted, index) => {
      const provider = providerAccepted.savedProvider?.provider;
      if (provider) {
        const providerName = formatProviderName(provider);
        const isActive = providerAccepted.savedProvider?.isActive;
        const statusIndicator = isActive ? colors.green + '●' + colors.reset : colors.red + '●' + colors.reset;
        console.log(`  ${statusIndicator} ${colors.white}${providerName}${colors.reset} ${colors.dim}(NexHealth ID: ${provider.nexhealthProviderId})${colors.reset}`);
      }
    });
  } else {
    console.log(`  ${colors.dim}No providers assigned${colors.reset}`);
  }

  if (appointmentType.lastSyncError) {
    console.log();
    console.log(`${colors.bright}${colors.red}Sync Error:${colors.reset}`);
    console.log(`  ${colors.red}${truncateText(appointmentType.lastSyncError, 100)}${colors.reset}`);
  }
  
  console.log();
  console.log(`${colors.bright}Timestamps:${colors.reset}`);
  console.log(`  Created: ${colors.dim}${formatDate(appointmentType.createdAt)}${colors.reset}`);
  console.log(`  Updated: ${colors.dim}${formatDate(appointmentType.updatedAt)}${colors.reset}`);
  
  printSeparator();
}

function printSummary(appointmentTypes) {
  console.log();
  console.log(colors.bright + colors.cyan + '📊 SUMMARY' + colors.reset);
  console.log(`Total Appointment Types: ${colors.bright}${appointmentTypes.length}${colors.reset}`);
  
  const onlineBookable = appointmentTypes.filter(at => at.bookableOnline === true).length;
  const offlineOnly = appointmentTypes.filter(at => at.bookableOnline === false).length;
  const unknownBooking = appointmentTypes.filter(at => at.bookableOnline === null || at.bookableOnline === undefined).length;
  
  console.log(`Online Bookable: ${colors.green}${onlineBookable}${colors.reset}`);
  console.log(`Offline Only: ${colors.red}${offlineOnly}${colors.reset}`);
  console.log(`Unknown Status: ${colors.yellow}${unknownBooking}${colors.reset}`);
  
  const withKeywords = appointmentTypes.filter(at => at.keywords && at.keywords.trim()).length;
  console.log(`With Keywords: ${colors.blue}${withKeywords}${colors.reset}`);
  
  const withErrors = appointmentTypes.filter(at => at.lastSyncError).length;
  if (withErrors > 0) {
    console.log(`With Sync Errors: ${colors.red}${withErrors}${colors.reset}`);
  }
  
  // Provider statistics
  const withProviders = appointmentTypes.filter(at => at.acceptedByProviders && at.acceptedByProviders.length > 0).length;
  const withoutProviders = appointmentTypes.length - withProviders;
  console.log(`With Providers: ${colors.green}${withProviders}${colors.reset}`);
  console.log(`Without Providers: ${colors.yellow}${withoutProviders}${colors.reset}`);
  
  // Count total provider assignments (not unique providers)
  const totalProviderAssignments = appointmentTypes.reduce((sum, at) => {
    return sum + (at.acceptedByProviders ? at.acceptedByProviders.length : 0);
  }, 0);
  console.log(`Total Provider Assignments: ${colors.cyan}${totalProviderAssignments}${colors.reset}`);
  
  // Group by practice
  const practiceGroups = appointmentTypes.reduce((acc, at) => {
    acc[at.practiceId] = (acc[at.practiceId] || 0) + 1;
    return acc;
  }, {});
  
  const practiceCount = Object.keys(practiceGroups).length;
  console.log(`Across Practices: ${colors.magenta}${practiceCount}${colors.reset}`);
  
  if (practiceCount > 1) {
    console.log();
    console.log(colors.bright + 'Per Practice Breakdown:' + colors.reset);
    Object.entries(practiceGroups).forEach(([practiceId, count]) => {
      console.log(`  ${colors.dim}${practiceId}${colors.reset}: ${count} appointment types`);
    });
  }
  
  console.log();
}

async function main() {
  try {
    printHeader();
    
    console.log(colors.blue + 'Fetching appointment types from database...' + colors.reset);
    
    const appointmentTypes = await prisma.appointmentType.findMany({
      include: {
        acceptedByProviders: {
          include: {
            savedProvider: {
              include: {
                provider: true
              }
            }
          }
        }
      },
      orderBy: [
        { practiceId: 'asc' },
        { name: 'asc' }
      ]
    });
    
    if (appointmentTypes.length === 0) {
      console.log();
      console.log(colors.yellow + '⚠️  No appointment types found in the database.' + colors.reset);
      console.log();
      return;
    }
    
    console.log(colors.green + `✅ Found ${appointmentTypes.length} appointment types` + colors.reset);
    
    appointmentTypes.forEach((appointmentType, index) => {
      printAppointmentType(appointmentType, index, appointmentTypes.length);
    });
    
    printSummary(appointmentTypes);
    
  } catch (error) {
    console.error();
    console.error(colors.red + '❌ Error fetching appointment types:' + colors.reset);
    console.error(colors.red + error.message + colors.reset);
    console.error();
    
    if (error.code === 'P1001') {
      console.error(colors.yellow + '💡 Tip: Make sure your database is running and DATABASE_URL is set correctly.' + colors.reset);
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log();
  console.log(colors.yellow + 'Shutting down...' + colors.reset);
  await prisma.$disconnect();
  process.exit(0);
});

main(); 