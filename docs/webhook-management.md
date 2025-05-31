# NexHealth Webhook Management

This document explains how to manage NexHealth webhook endpoints and subscriptions for the Laine AI Voice Assistant SaaS platform.

## Overview

The webhook management system consists of:
- **Global Webhook Endpoint**: A single endpoint on NexHealth that receives events for all practices
- **Practice Subscriptions**: Individual subscriptions linking practices to specific events
- **Management Script**: CLI tool for setting up and managing webhooks programmatically

## Prerequisites

1. **Environment Variables** (in `.env`):
   ```bash
   NEXHEALTH_API_KEY=your_master_api_key_here
   NEXT_PUBLIC_APP_URL=https://your-app-domain.com
   DATABASE_URL=your_postgresql_connection_string
   ```

2. **Master API Key**: You need the NexHealth master API key (not a practice-specific bearer token) to manage webhook endpoints.

## Quick Start

### 1. Setup Global Webhook Endpoint

First, create the global webhook endpoint that will receive events for all practices:

```bash
# Using npm script (recommended)
pnpm webhook:setup

# Or directly
node scripts/manage-nexhealth-webhooks.js setup-global-endpoint
```

This command:
- ✅ Checks if endpoint already exists in database
- ✅ Creates new endpoint on NexHealth if needed
- ✅ Stores endpoint ID and secret key in database
- ✅ Handles URL changes and endpoint updates
- ✅ Is idempotent (safe to run multiple times)

**Output:**
```
🚀 Setting up Global NexHealth Webhook Endpoint...
✅ Successfully created and stored Global Webhook Endpoint:
   NexHealth Endpoint ID: 12345
   Target URL: https://your-app.vercel.app/api/nexhealth-webhook
   Secret Key: wh_secret_xyz... (stored securely in database)
```

### 2. Subscribe a Practice to Events

After setting up the global endpoint, subscribe individual practices:

```bash
# Using npm script (recommended)
pnpm webhook:subscribe dentistoffice

# Or directly
node scripts/manage-nexhealth-webhooks.js subscribe-practice dentistoffice
```

This command:
- ✅ Looks up practice by subdomain in your database
- ✅ Subscribes to predefined events (patient_created, appointment_insertion.complete, etc.)
- ✅ Stores subscription details in database
- ✅ Skips already-subscribed events
- ✅ Continues on individual event failures

**Output:**
```
🔗 Subscribing practice "dentistoffice" to NexHealth events...
   ✅ Successfully subscribed to Patient.patient_created. NexHealth Subscription ID: 67890
   ✅ Successfully subscribed to Appointment.appointment_insertion.complete. NexHealth Subscription ID: 67891
   👍 Practice "dentistoffice" already subscribed to Appointment.appointment_insertion.failed (ID: 67892).
🎉 Practice "dentistoffice" event subscriptions processed.
   ✅ Successfully subscribed: 2
   👍 Already subscribed: 1
   ❌ Failed: 0
```

### 3. List Active Subscriptions

View all webhook subscriptions or filter by practice:

```bash
# List all subscriptions
pnpm webhook:list

# List subscriptions for specific practice
pnpm webhook:list dentistoffice

# Or directly
node scripts/manage-nexhealth-webhooks.js list-subscriptions
node scripts/manage-nexhealth-webhooks.js list-subscriptions dentistoffice
```

**Output:**
```
📋 Listing NexHealth webhook subscriptions...
📊 Found 3 subscription(s):

🏥 Practice: dentistoffice
   ✅ Active | Patient.patient_created | NexHealth ID: 67890
   ✅ Active | Appointment.appointment_insertion.complete | NexHealth ID: 67891
   ✅ Active | Appointment.appointment_insertion.failed | NexHealth ID: 67892
```

## Commands Reference

### setup-global-endpoint
Creates and configures the global webhook endpoint for your SaaS platform.

```bash
node scripts/manage-nexhealth-webhooks.js setup-global-endpoint
```

**What it does:**
1. Checks database for existing endpoint configuration
2. Validates target URL matches current `NEXT_PUBLIC_APP_URL`
3. Queries NexHealth for conflicting endpoints
4. Creates new endpoint on NexHealth
5. Stores endpoint ID and secret in `GlobalNexhealthWebhookEndpoint` table

**Idempotency:** Safe to run multiple times. Will skip if already configured correctly.

### subscribe-practice <subdomain>
Subscribes a practice to NexHealth webhook events.

```bash
node scripts/manage-nexhealth-webhooks.js subscribe-practice <subdomain>
```

**Parameters:**
- `<subdomain>`: The NexHealth subdomain for the practice (must exist in your database)

**Subscribed Events:**
- `Patient.patient_created` - New patients added to the practice
- `Patient.patient_updated` - Patient information changes (contact details, demographics, etc.)
- `Appointment.appointment_created` - New appointments detected in EHR (made outside Laine)
- `Appointment.appointment_updated` - Appointment changes (rescheduling, cancellations, modifications)
- `Appointment.appointment_insertion.complete` - New appointments scheduled successfully by Laine
- `Appointment.appointment_insertion.failed` - Failed appointment scheduling attempts by Laine
- `SyncStatus.sync_status_read_change` - EHR read functionality status changes (monitoring)
- `SyncStatus.sync_status_write_change` - EHR write functionality status changes (monitoring)

**What it does:**
1. Validates practice exists in your database
2. Retrieves global endpoint ID from database
3. Creates subscriptions for each event type on NexHealth
4. Stores subscription details in `NexhealthWebhookSubscription` table

### list-subscriptions [subdomain]
Lists all webhook subscriptions, optionally filtered by practice.

```bash
node scripts/manage-nexhealth-webhooks.js list-subscriptions [subdomain]
```

**Parameters:**
- `[subdomain]`: Optional. Filter results to specific practice

## Database Integration

The script integrates with your Prisma database using these models:

### GlobalNexhealthWebhookEndpoint
Stores the global webhook endpoint configuration:
```prisma
model GlobalNexhealthWebhookEndpoint {
  id                  String    @id @default("singleton")
  nexhealthEndpointId String    @unique // NexHealth endpoint ID
  secretKey           String    // Webhook verification secret
  targetUrl           String    // Your webhook handler URL
  isEnabled           Boolean   @default(true)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
}
```

### NexhealthWebhookSubscription
Tracks practice-specific event subscriptions:
```prisma
model NexhealthWebhookSubscription {
  id                          String   @id @default(cuid())
  practiceId                  String
  nexhealthWebhookEndpointId  String   // References global endpoint
  nexhealthSubscriptionId     String   @unique // NexHealth subscription ID
  resourceType                String   // "Patient", "Appointment", etc.
  eventName                   String   // "patient_created", etc.
  isActive                    Boolean  @default(true)
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt
}
```

## Webhook Handler Integration

Your webhook handler at `/api/nexhealth-webhook` automatically:
- ✅ Retrieves secret key from database for signature verification
- ✅ Identifies practice by subdomain from webhook payload
- ✅ Processes events according to your business logic
- ✅ Returns appropriate HTTP responses to NexHealth

## Troubleshooting

### "Practice not found" Error
**Problem:** `❌ Practice with subdomain "xyz" not found in your database.`

**Solution:** Ensure the practice has been configured in your application first through the practice configuration flow.

### "Global webhook endpoint not configured" Error
**Problem:** `❌ Global webhook endpoint not configured in DB. Run "setup-global-endpoint" first.`

**Solution:** Run the setup command:
```bash
pnpm webhook:setup
```

### "NEXHEALTH_API_KEY not found" Error
**Problem:** `❌ NEXHEALTH_API_KEY (master key) not found in environment variables.`

**Solution:** Add your NexHealth master API key to `.env`:
```bash
NEXHEALTH_API_KEY=your_master_api_key_here
```

### "Invalid signature" in Webhook Handler
**Problem:** Webhook requests are being rejected with signature verification errors.

**Solution:** 
1. Verify the secret key in database matches what NexHealth has
2. Run `webhook:setup` to refresh the endpoint and secret
3. Check that `NEXT_PUBLIC_APP_URL` is set correctly

## Security Considerations

1. **Master API Key**: Keep your `NEXHEALTH_API_KEY` secure. It has full access to your NexHealth account.

2. **Secret Storage**: Webhook secrets are stored in your database, not environment variables, for better security and rotation capability.

3. **Signature Verification**: All webhook requests are cryptographically verified using HMAC-SHA256.

4. **HTTPS Only**: Webhook endpoints must use HTTPS in production.

## Production Deployment

1. **Set Environment Variables:**
   ```bash
   NEXHEALTH_API_KEY=your_production_master_key
   NEXT_PUBLIC_APP_URL=https://your-production-domain.com
   DATABASE_URL=your_production_postgresql_url
   ```

2. **Setup Global Endpoint:**
   ```bash
   pnpm webhook:setup
   ```

3. **Subscribe Practices:**
   ```bash
   # For each practice
   pnpm webhook:subscribe practice-subdomain-1
   pnpm webhook:subscribe practice-subdomain-2
   # etc.
   ```

4. **Verify Setup:**
   ```bash
   pnpm webhook:list
   ```

## Development vs Production

- **Development**: Use `http://localhost:3000` for `NEXT_PUBLIC_APP_URL`
- **Production**: Use your actual domain (e.g., `https://laine-integrated.vercel.app`)
- **Testing**: Use a separate NexHealth sandbox account if available

The script automatically handles URL changes when you redeploy or change domains. 