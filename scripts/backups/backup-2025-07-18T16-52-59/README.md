# Laine Practice Data Backup

Created: 7/18/2025, 10:23:11 PM
Practice: Royal Oak Family Dental
Practice ID: cmd8zk6810000ky0445f078j6

## Files Included:

1. **practice-config.json** - Main practice configuration
2. **appointment-types.json** - All appointment types with keywords and settings
3. **providers.json** - All providers from NexHealth
4. **saved-providers.json** - Active providers with operatory and appointment type assignments
5. **operatories.json** - All operatories with active/inactive status
6. **webhook-config.json** - Webhook subscriptions and global endpoint config
7. **assistant-config.json** - AI assistant configuration (voice, prompts, etc.)
8. **call-logs.json** - Recent call logs (last 100)
9. **tool-logs.json** - Recent tool execution logs (last 500)
10. **backup-summary.json** - Summary of what was backed up

## Data Counts:

- Appointment Types: 10
- Providers: 13
- Active Saved Providers: 1
- Operatories: 12
- Webhook Subscriptions: 6
- Recent Call Logs: 2
- Recent Tool Logs: 4

## Security Notes:

- Webhook secret keys are NOT included for security
- Full transcripts are NOT included to keep file sizes manageable
- Tool call arguments/results are NOT included to keep file sizes manageable

## Usage:

These JSON files can be used to:
- Restore your configuration in a new environment
- Analyze your practice data
- Create reports or documentation
- Migrate to a different system
- Debug issues by examining historical data

To load any file in Node.js:
```javascript
const data = JSON.parse(fs.readFileSync('appointment-types.json', 'utf8'));
```
