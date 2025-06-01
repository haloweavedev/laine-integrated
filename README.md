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

# LAINE Project Context

## **Project Overview**
**LAINE** is an AI voice receptionist SaaS platform for dental practices. It enables dental offices to automate patient interactions, appointment scheduling, and EHR integration through AI voice assistants.

## **Core Functionality**
- **AI Voice Reception**: Patients call and speak with an AI assistant (powered by VAPI)
- **Patient Lookup**: Find existing patients in the practice's EHR system
- **Appointment Scheduling**: Check availability and book appointments
- **EHR Integration**: Connect with NexHealth to access patient records and scheduling
- **Multi-Tenant SaaS**: Each dental practice gets isolated data and configuration

## **Technology Stack**

### **Frontend**
- **Next.js 15+** (App Router)
- **React 19** with TypeScript
- **Tailwind CSS** for styling
- **Clerk** for authentication

### **Backend**
- **Next.js API Routes** 
- **Prisma ORM** with PostgreSQL
- **Supabase** for database hosting

### **External Integrations**
- **VAPI**: AI voice calling platform
- **NexHealth**: Dental practice EHR/scheduling system  
- **Clerk**: User authentication and management

### **Key Dependencies**
- `@clerk/nextjs` - Authentication
- `@prisma/client` - Database ORM
- `zod` - Schema validation
- `sonner` - Toast notifications

## **Architecture Patterns**

### **Multi-Tenant SaaS Design**
- Each dental practice is isolated by `practiceId`
- Users authenticate via Clerk (`clerkUserId`)
- All data operations are practice-scoped

### **Tool-Based AI Framework**
- AI assistant uses "tools" to perform actions
- Tools are TypeScript functions with Zod schemas
- Centralized tool execution via webhook handler

### **API Integration Layer**
- NexHealth API for EHR operations
- VAPI API for voice assistant management
- Token-based authentication with caching

## **Database Schema (Key Models)**

### **Core Models**
```prisma
Practice {
  id: String (Primary Key)
  clerkUserId: String (Unique - links to Clerk user)
  name: String? (Optional practice name)
  nexhealthSubdomain: String? (NexHealth subdomain)
  nexhealthLocationId: String? (NexHealth location ID)
}

PracticeAssistantConfig {
  practiceId: String (FK to Practice)
  vapiAssistantId: String? (VAPI assistant ID)
  voiceProvider: String (voice provider)
  systemPrompt: String (AI instructions)
  firstMessage: String (greeting message)
}
```

### **Scheduling Models**
```prisma
AppointmentType {
  practiceId: String (FK to Practice)
  nexhealthAppointmentTypeId: String (NexHealth ID)
  name: String (e.g., "General Cleanup")
  duration: Int (minutes)
}

Provider {
  practiceId: String (FK to Practice) 
  nexhealthProviderId: String (NexHealth ID)
  firstName: String?
  lastName: String
}

SavedProvider {
  practiceId: String (FK to Practice)
  providerId: String (FK to Provider)
  isDefault: Boolean
  isActive: Boolean
}
```

### **Logging Models**
```prisma
CallLog {
  vapiCallId: String (Unique - from VAPI)
  practiceId: String (FK to Practice)
  callStatus: String (e.g., "IN_PROGRESS", "ENDED")
  transcriptText: String?
  nexhealthPatientId: String? (if patient found)
}

ToolLog {
  practiceId: String (FK to Practice)
  vapiCallId: String? (FK to CallLog)
  toolName: String (e.g., "find_patient_in_ehr")
  toolCallId: String (VAPI tool call ID)
  arguments: String (JSON)
  result: String (JSON)
  success: Boolean
}
```

## **Key API Endpoints**

### **VAPI Integration**
- `POST /api/vapi/tool-calls` - Centralized tool execution webhook
- `POST /api/vapi/webhook` - General VAPI webhooks (call status, transcripts)

### **Practice Configuration**
- `POST /api/practice-config/providers` - Save provider preferences
- `POST /api/practice-config/operatories` - Save operatory preferences
- `POST /api/sync-nexhealth` - Sync data from NexHealth API

### **NexHealth Integration**
- `POST /api/nexhealth-webhook` - Receive NexHealth events
- `POST /api/webhook-subscribe` - Subscribe to NexHealth events

## **AI Tools Framework**

### **Tool Structure**
Each tool is defined with:
```typescript
interface ToolDefinition<T extends z.ZodType> {
  name: string                    // Tool identifier
  description: string             // What the tool does
  schema: T                      // Zod validation schema
  run: (params) => Promise<ToolResult>  // Tool execution logic
  messages?: ToolMessages        // VAPI voice prompts
}
```

### **Current Tools**
1. **`find_patient_in_ehr`** - Search for patients by name and DOB
2. **`find_appointment_type`** - Match patient requests to appointment types
3. **`check_available_slots`** - Find available appointment times

### **Tool Execution Flow**
1. VAPI calls `/api/vapi/tool-calls` webhook
2. Practice identified by assistant ID
3. Tool arguments validated with Zod
4. Tool executes with practice context
5. Results logged to database
6. Response sent back to VAPI

## **Typical User Journey**

### **Practice Setup**
1. Practice owner signs up via Clerk
2. Configure NexHealth subdomain and location ID
3. Sync appointment types and providers from NexHealth
4. Select preferred providers and operatories for scheduling
5. Create and configure VAPI voice assistant

### **Patient Interaction**
1. Patient calls dental office phone number
2. VAPI voice assistant answers
3. Assistant asks for patient name and date of birth
4. `find_patient_in_ehr` tool searches NexHealth EHR
5. If patient found, assistant asks about appointment purpose
6. `find_appointment_type` tool matches request to available types
7. `check_available_slots` tool finds available times
8. Assistant presents options to patient

## **Environment Variables**
```bash
# Database
DATABASE_URL=postgresql://...

# Authentication  
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# VAPI Integration
VAPI_API_KEY=vapi_...
NEXT_PUBLIC_APP_URL=https://your-domain.com

# NexHealth Integration
NEXHEALTH_API_KEY=nexhealth_...
NEXHEALTH_API_BASE_URL=https://nexhealth.info
```

## **Key File Structure**
```
app/
├── api/
│   ├── vapi/
│   │   ├── tool-calls/route.ts     # Centralized tool handler
│   │   └── webhook/route.ts        # VAPI general webhooks
│   ├── practice-config/            # Practice management APIs
│   └── nexhealth-webhook/route.ts  # NexHealth event handler
├── practice-config/                # Practice configuration UI
└── laine/                         # Assistant configuration UI

lib/
├── tools/
│   ├── types.ts                   # Tool framework types
│   ├── index.ts                   # Tool registry
│   ├── findPatient.ts            # Patient lookup tool
│   ├── findAppointmentType.ts    # Appointment type matching
│   └── checkAvailableSlots.ts    # Availability checking
├── nexhealth.ts                  # NexHealth API client
├── vapi.ts                       # VAPI API client
└── prisma.ts                     # Database client

prisma/
└── schema.prisma                  # Database schema
```

## **Development Commands**
```bash
# Development
pnpm dev                          # Start development server
pnpm build                        # Build for production
pnpm lint                         # Run ESLint

# Database
pnpm db:push                      # Push schema changes
pnpm db:list                      # List database contents
pnpm db:clean                     # Clean test data

# Webhooks
pnpm webhook:setup                # Setup NexHealth webhook endpoint
pnpm webhook:subscribe <subdomain> # Subscribe practice to events
pnpm webhook:list                 # List webhook subscriptions
```

## **Common Patterns**

### **Practice Context Injection**
All operations include practice context:
```typescript
const practice = await findPracticeByAssistantId(assistantId);
// All subsequent operations are practice-scoped
```

### **Error Handling**
User-friendly error messages for patients:
```typescript
return {
  success: false,
  error_code: "PATIENT_NOT_FOUND",
  message_to_patient: "I couldn't find that patient. Would you like to try different information?"
};
```

### **Tool Result Format**
Standardized response format:
```typescript
interface ToolResult {
  success: boolean
  message_to_patient: string  // What the AI says to the patient
  data?: Record<string, unknown>  // Structured data
  error_code?: string  // Error classification
}
```