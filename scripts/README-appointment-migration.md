# Appointment Types Migration Scripts

## Overview

These scripts allow you to export appointment types from one user/practice and import them to another, including full NexHealth API integration.

## Scripts

### 1. `export-appointment-types.js`
**Purpose**: Export all appointment types from a specific user for migration

**Usage**:
1. Edit the script and change `TARGET_CLERK_USER_ID` to the source user
2. Run: `node scripts/export-appointment-types.js`
3. Output: `appointment-types-{userId}.md` with complete data

### 2. `import-appointment-types.js` 
**Purpose**: Import appointment types to a target user (creates in NexHealth + local DB)

**Usage**:
1. Edit the script and set `TARGET_CLERK_USER_ID` (destination) and `SOURCE_EXPORT_FILE`
2. Run: `node scripts/import-appointment-types.js`
3. Creates appointment types via NexHealth API and saves locally

## Complete Migration Workflow

### Step 1: Export from Source User
```bash
# 1. Edit export-appointment-types.js
TARGET_CLERK_USER_ID = "user_SOURCE_USER_ID_HERE";

# 2. Run export
node scripts/export-appointment-types.js

# Output: appointment-types-user_SOURCE_USER_ID_HERE.md
```

### Step 2: Import to Destination User
```bash
# 1. Edit import-appointment-types.js
TARGET_CLERK_USER_ID = "user_DESTINATION_USER_ID_HERE";
SOURCE_EXPORT_FILE = "appointment-types-user_SOURCE_USER_ID_HERE.md";

# 2. Run import
node scripts/import-appointment-types.js
```

## Export File Structure

The export file contains:

### 📋 **Practice Information**
- Clerk User ID
- NexHealth subdomain & location ID
- Practice name and metadata

### 📊 **Complete Data Table**
All appointment type fields:
- `name` - Display name
- `duration` - Minutes
- `bookableOnline` - Online booking flag
- `spokenName` - AI conversation name
- `check_immediate_next_available` - Urgency flag
- `keywords` - AI matching terms
- `webPatientStatus` - NEW/RETURNING/BOTH
- `nexhealthAppointmentTypeId` - External system ID
- Metadata (created, updated, sync errors)

### 🔧 **Ready-to-Use curl Commands**
- Complete NexHealth API calls for each appointment type
- Just replace `NEW_SUBDOMAIN` and `NEW_LOCATION_ID` with target values

### 📄 **JSON Export**
Structured data for programmatic processing

## Key Features

✅ **User-Specific**: Uses `clerkUserId` for precise targeting  
✅ **Complete Data**: All fields from database schema  
✅ **NexHealth Integration**: Real API calls with error handling  
✅ **Migration Ready**: Structured for easy transfer between practices  
✅ **Audit Trail**: Includes sync status and error tracking  
✅ **Rate Limited**: Includes delays to avoid API limits  

## Error Handling

- **Export**: Lists available user IDs if target not found
- **Import**: Validates NexHealth configuration before processing
- **API**: Handles NexHealth API errors gracefully
- **Consistency**: Only creates locally if NexHealth creation succeeds

## Prerequisites

- Database connection configured (`.env`)
- NexHealth API access token
- Target practice must have valid NexHealth configuration

## Example Output

```markdown
# Appointment Types Migration Data

## Practice Information
- **Practice Name:** Royal Oak Dental
- **Clerk User ID:** user_2oVFLwKT9234567890abcdef
- **NexHealth Subdomain:** royaloak
- **NexHealth Location ID:** 12345
- **Total Types:** 8
- **Exported:** 2025-01-18T10:30:00.000Z

## NexHealth API Configuration
Base URL: `https://nexhealth.info`
Subdomain: `royaloak`
Location ID: `12345`

### Sample curl command to create appointment type:
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=royaloak' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{...}'
```

## Notes

- The import script creates appointment types in both NexHealth and the local database
- Each import includes a 500ms delay to respect API rate limits  
- Failed imports are logged but don't stop the process
- Local database creation only happens after successful NexHealth creation
