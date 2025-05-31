# Laine AI Voice Assistant

AI-powered voice assistant for healthcare practices, integrating NexHealth EHR with VAPI voice AI technology.

## Features

- 🎙️ **VAPI Voice Integration**: AI-powered voice calls with customizable assistants
- 🏥 **NexHealth EHR Integration**: Patient lookup, appointment management, and data synchronization
- 🔗 **Webhook Management**: Automated event handling for appointments and patient updates
- 👤 **Practice Management**: Multi-tenant SaaS platform with practice-specific configurations
- 🔒 **Secure Authentication**: Clerk-based user authentication and practice isolation

## Quick Start

1. **Environment Setup**:
   ```bash
   cp .env.example .env
   # Configure your API keys and database URL
   ```

2. **Database Setup**:
   ```bash
   pnpm install
   pnpm db:push
   ```

3. **Development Server**:
   ```bash
   pnpm dev
   ```

4. **Webhook Configuration** (Production):
   ```bash
   # Setup global webhook endpoint
   pnpm webhook:setup
   
   # Subscribe practices to events
   pnpm webhook:subscribe your-practice-subdomain
   ```

## Documentation

- 📖 [Webhook Management Guide](docs/webhook-management.md) - Complete guide to NexHealth webhook setup
- 🛠️ [API Documentation](docs/api.md) - API endpoints and integration details

## Technology Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Clerk
- **Voice AI**: VAPI
- **EHR Integration**: NexHealth API
- **Deployment**: Vercel

## Key Components

### VAPI Assistant Integration
- AI voice assistants with customizable voices and prompts
- Tool calling system for EHR operations
- Call logging and transcript management

### NexHealth Integration  
- Patient search and data retrieval
- Appointment scheduling and management
- Real-time webhook event processing

### Practice Management
- Multi-tenant architecture with practice isolation
- Configurable assistant settings per practice
- Automated practice onboarding workflow
