# PROTOTYPE_ARCHITECTURE.md

## Technical Documentation: Laine AI Prototype Core Logic Patterns

**Purpose:** This document reverse-engineers the Laine AI prototype to document the fundamental patterns used for VAPI tool creation, state management, custom AI interactions, and database structures. This analysis provides a blueprint for migrating proven logic to a new, multi-tenant production system.

---

## 1. VAPI Assistant Creation

### Assistant Creation Process

The VAPI assistant creation is handled through the `createVapiAssistant` function in `lib/vapi.ts`. The process makes a `POST /assistant` call to the VAPI API.

**File:** `lib/vapi.ts`
```typescript
export async function createVapiAssistant(assistantConfig: CreateAssistantDTO): Promise<VapiAssistant> {
  console.log("[VAPI] Creating assistant:", assistantConfig.name);
  const result = await vapiRequest("/assistant", "POST", assistantConfig as unknown as Record<string, unknown>);
  return result as unknown as VapiAssistant;
}

async function vapiRequest(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!VAPI_API_KEY) {
    throw new Error("VAPI_API_KEY is not configured");
  }

  const url = `${VAPI_API_BASE_URL}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  // ... error handling and response parsing
}
```

**Assistant Configuration Example:**
The assistant payload structure is defined in production usage:

**File:** `app/laine/page.tsx`
```typescript
const assistantConfig = {
  name: `Laine - ${practice.name}`,
  firstMessage: "Hello! This is Laine from your dental office. How can I help you today?",
  model: {
    provider: "openai",
    model: "gpt-4o-mini",
    messages: [{ 
      role: "system", 
      content: "You are a helpful AI assistant for a dental practice. Your primary goal is to assist patients. Be polite and efficient." 
    }],
    tools: getAllTools(appBaseUrl)  // Tools are injected here
  },
  voice: {
    provider: "vapi",
    voiceId: "Elliot"
  },
  serverMessages: ["end-of-call-report", "status-update", "tool-calls"],
  silenceTimeoutSeconds: 30,
  maxDurationSeconds: 600,
  backgroundSound: "office",
  backchannelingEnabled: true,
  backgroundDenoisingEnabled: true,
  modelOutputInMessagesEnabled: true
};
```

### Server URL Configuration

**Key Finding:** The `serverUrl` is **dynamically generated** based on the application's base URL, not hardcoded.

**File:** `lib/tools/definitions/checkAvailableSlotsTool.ts`
```typescript
export function getCheckAvailableSlotsTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "checkAvailableSlots",
      description: "Finds available appointment times. By default, proactively searches for the next available appointments. Call this after the appointment type is known.",
      parameters: {
        type: "object" as const,
        properties: {
          preferredDaysOfWeek: {
            type: "string" as const,
            description: "A JSON string array of the user's preferred days of the week. Example: '[\"Monday\", \"Wednesday\"]'. This is collected from the user."
          },
          timeBucket: {
            type: "string" as const,
            description: "The user's general time preference, which must be one of the following values: 'Early', 'Morning', 'Midday', 'Afternoon', 'Evening', 'Late', or 'AllDay'."
          },
          requestedDate: {
            type: "string" as const,
            description: "The user's specific requested date, like 'tomorrow', 'next Wednesday', or 'July 10th'."
          }
        },
        required: []
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,  // Dynamic URL generation
    }
  };
}
```

### Tool Definition Architecture

**Key Finding:** Tool definitions are **not hardcoded** directly in the assistant payload. They are centrally managed and dynamically injected.

**File:** `lib/tools/index.ts`
```typescript
export const toolDefinitionMap = {
  findAppointmentType: getFindAppointmentTypeTool,
  identifyPatient: getIdentifyPatientTool,
  checkAvailableSlots: getCheckAvailableSlotsTool,
  selectAndBookSlot: getSelectAndBookSlotTool,
  insuranceInfo: getInsuranceInfoTool,
};

export function getAllTools(appBaseUrl: string): VapiTool[] {
  const tools: VapiTool[] = Object.values(toolDefinitionMap).map(getToolFn => getToolFn(appBaseUrl));
  return tools;
}
```

**Tool Server Property:** Each tool definition includes its own `server` property pointing to the unified webhook endpoint.

**File:** `lib/tools/definitions/selectAndBookSlotTool.ts`
```typescript
export function getSelectAndBookSlotTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "selectAndBookSlot",
      description: "Selects a time slot and, with final user confirmation, books the appointment. This is the final step in the booking process.",
      parameters: {
        type: "object" as const,
        properties: {
          userSelection: {
            type: "string" as const,
            description: "The user's verbal selection of a time slot (e.g., '10 AM', 'the first one', '8:30')"
          },
          finalConfirmation: {
            type: "boolean" as const,
            description: "Set to true only after the user has verbally confirmed the exact time and date."
          }
        },
        required: ["userSelection"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,  // Unified webhook endpoint
    }
  };
}
```

---

## 2. Conversation State Management

### State Object Structure

The primary state management revolves around the `ConversationState` interface, which provides comprehensive tracking of the booking flow.

**File:** `types/laine.ts`
```typescript
export interface ConversationState {
  callId: string;
  practiceId: string;

  patient: {
    status: 'UNKNOWN' | 'IDENTIFIED_EXISTING' | 'NEW_DETAILS_COLLECTED';
    id?: number; // NexHealth Patient ID
    firstName?: string;
    lastName?: string;
    dob?: string;
    phone?: string;
    email?: string;
    isNameConfirmed: boolean;
  };

  insurance: {
    status: 'NOT_CHECKED' | 'IN_NETWORK' | 'OUT_OF_NETWORK';
    queriedPlan?: string;
  };

  booking: {
    appointmentTypeId?: string;
    appointmentTypeName?: string;
    spokenName?: string;
    duration?: number;
    isUrgent: boolean;
    presentedSlots: SlotData[];
    selectedSlot?: SlotData;
    heldSlotId?: string; // The ID of the temporarily held slot from NexHealth
    heldSlotExpiresAt?: string; // ISO timestamp for when the hold expires
    confirmedBookingId?: string; // The final NexHealth appointment ID
  };

  lastAction?: 'GREETED' | 'IDENTIFIED_APPOINTMENT_TYPE' | 'CHECKED_INSURANCE' | 'IDENTIFIED_PATIENT' | 'OFFERED_SLOTS' | 'HELD_SLOT';
}
```

### State Persistence and Hydration

**Persistence Method:** State is stored in the database `CallLog` table's `conversationState` JSON field.

**State Retrieval (Hydration):**
**File:** `app/api/vapi-webhook/route.ts`
```typescript
// State management: retrieve or initialize conversation state
let state: ConversationState;
const callLog = await prisma.callLog.findUniqueOrThrow({ where: { vapiCallId: callId } });

if (callLog.conversationState && typeof callLog.conversationState === 'object' && callLog.conversationState !== null) {
  state = callLog.conversationState as unknown as ConversationState;
  console.log(`[StatefulWebhook] Retrieved state for call: ${callId}`);
} else {
  // Initialize state with new canonical structure
  state = {
    callId: callId,
    practiceId: practiceId,
    patient: {
      status: 'UNKNOWN',
      isNameConfirmed: false
    },
    insurance: {
      status: 'NOT_CHECKED'
    },
    booking: {
      isUrgent: false,
      presentedSlots: []
    }
  };
  console.log(`[StatefulWebhook] Initialized new canonical state for call: ${callId}`);
}
```

**State Persistence (Write Operation):**
**File:** `app/api/vapi-webhook/route.ts`
```typescript
// Use the exact newState object from the handler's result for all subsequent operations.
const newState = handlerResult.newState;

// Atomically save the new, complete state to the database.
await prisma.callLog.update({
  where: { vapiCallId: callId },
  data: { conversationState: newState as unknown as Prisma.InputJsonValue }
});
console.log(`[StatefulWebhook] Persisted state for call: ${callId}`);
```

**State Update Pattern:** Each tool handler receives the current state, processes it, and returns a new state object. The webhook handler atomically saves this new state.

---

## 3. Custom AI and Service Integration

### Custom AI Functions

The prototype extends beyond the main VAPI assistant with several specialized AI functions using OpenAI's `generateText` from the AI SDK.

#### 1. Slot Matching AI

**File:** `lib/ai/slotMatcher.ts`
```typescript
export async function matchUserSelectionToSlot(
  userSelection: string,
  presentedSlots: SlotData[],
  practiceTimezone: string
): Promise<SlotData | null> {
  // Create a simplified, numbered list of slots for the AI to parse.
  const formattedSlotsForAI = presentedSlots.map((slot, index) => {
    const time = DateTime.fromISO(slot.time, { zone: practiceTimezone }).toFormat("cccc 'at' h:mm a");
    return `${index + 1}. ${time}`;
  }).join("\n");

  const systemPrompt = `You are a highly accurate AI assistant. Your task is to match a user's verbal selection to one of the provided time slot options.

**CRITICAL RULES:**
1.  **RETURN ONLY THE NUMBER:** Your entire response must be ONLY the number corresponding to the best match (e.g., "1", "2").
2.  **HANDLE AMBIGUITY:** If the user's selection is ambiguous or doesn't clearly match, return "NO_MATCH".
3.  **BE FLEXIBLE:** The user might not say the exact time. "The morning one," "the first one," "the 3:10," or "let's do the later one" are all valid selections.

**CONTEXT:**
The user was presented with these numbered options:
${formattedSlotsForAI}

The user then said: "${userSelection}"

Which option number did the user select? (Return ONLY the number or "NO_MATCH")`;

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    messages: [{ role: 'system', content: systemPrompt }],
    temperature: 0, // Set to 0 for maximum predictability
    maxTokens: 10,
  });

  const matchedIndex = parseInt(text.trim(), 10) - 1;
  // ... validation and return logic
}
```

#### 2. Appointment Type Matching AI

**File:** `lib/ai/appointmentMatcher.ts`
```typescript
export async function matchAppointmentTypeIntent(
  patientQuery: string,
  availableAppointmentTypes: ApptTypeInputForMatcher[]
): Promise<string | null> {
  // Format appointment types for the LLM prompt
  const formattedTypesString = availableAppointmentTypes
    .map(type => `ID: ${type.id}, Name: ${type.name}, Keywords: ${type.keywords || "None"}`)
    .join("\n");

  const messages: CoreMessage[] = [
    {
      role: "system",
      content: `You are an expert AI assistant for a dental office. Your task is to match a patient's stated reason for calling with the most appropriate dental appointment type from the provided list.
The list includes appointment type IDs, names, and associated keywords.
Respond ONLY with the 'ID' of the best matching appointment type.
If no clear match is found based on the patient's query and the available types/keywords, respond with "NO_MATCH".`
    },
    {
      role: "user",
      content: `Patient's reason for calling: "${patientQuery}"

Available appointment types:
${formattedTypesString}

Which appointment type ID is the best match? (Return ONLY the ID or "NO_MATCH")`
    }
  ];

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    messages,
    temperature: 0.1,
    maxTokens: 10,
  });

  return text.trim() === "NO_MATCH" ? null : text.trim();
}
```

#### 3. Dynamic Acknowledgment Generation

**File:** `lib/ai/acknowledgmentGenerator.ts`
```typescript
export async function generateAcknowledgment(patientRequest: string): Promise<string> {
  const systemPrompt = `You are an expert AI copywriter specializing in creating short, natural-sounding conversational acknowledgments for a dental receptionist. Your response MUST be a single, short phrase and nothing else.

**CRITICAL RULES:**
- If the user's request expresses any kind of pain or discomfort (e.g., mentions pain, hurt, ache, chip, crack, sensitivity), generate an empathetic response.
  - Good example: "Oh no, that sounds painful. Let's get that sorted for you immediately."
- If the user's request is for a cosmetic or positive procedure (e.g., "veneers," "whitening," "Invisalign"), generate an encouraging and positive response.
  - Example for "I want to get my teeth whitened": "That's exciting! A brighter smile is a great goal."
- If the user's request is neutral or routine (e.g., "I need a cleaning," "check-up"), generate a simple, pleasant acknowledgment.`;

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: patientRequest }
    ],
    temperature: 0.2,
    maxTokens: 50,
  });

  return text.trim();
}
```

### NexHealth Integration

#### Client Initialization

**NexHealth API Configuration:** The client uses a **two-tier authentication system** - a master API key for authentication and bearer tokens for data access.

**File:** `lib/nexhealth.ts`
```typescript
const NEXHEALTH_API_BASE_URL = process.env.NEXHEALTH_API_BASE_URL!;
const MASTER_NEXHEALTH_API_KEY = process.env.NEXHEALTH_API_KEY!; // The master key

async function fetchNewBearerToken(): Promise<{ accessToken: string; expiresAt: Date }> {
  if (!MASTER_NEXHEALTH_API_KEY) {
    throw new Error("NEXHEALTH_API_KEY is not configured in environment variables.");
  }

  const authUrl = `${NEXHEALTH_API_BASE_URL}/authenticates`;
  
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.Nexhealth+json;version=2',
      'Authorization': MASTER_NEXHEALTH_API_KEY, // Raw master key for /authenticates
      'Content-Type': 'application/json',
    },
  });

  // ... token processing and caching
}
```

**Credential Management:** 
- **NEXHEALTH_API_KEY**: Hardcoded environment variable (master key)
- **NEXHEALTH_API_BASE_URL**: Hardcoded environment variable 
- **Subdomain & Location ID**: Read from Practice table per-practice configuration

#### Example API Calls

**Fetching Available Slots:**
**File:** `lib/nexhealth.ts`
```typescript
export async function getNexhealthAvailableSlots(
  subdomain: string,
  locationId: string,
  startDate: string, // YYYY-MM-DD format
  daysToSearch: number,
  providerNexHealthIds: string[],
  slotLengthMinutes: number
): Promise<NexHealthAppointmentSlot[]> {
  const params: Record<string, string | number | string[]> = {
    start_date: startDate,
    days: daysToSearch,
    'lids[]': locationId,
    slot_length: slotLengthMinutes,
  };

  // Add provider IDs as array parameters
  if (providerNexHealthIds.length > 0) {
    params['pids[]'] = providerNexHealthIds;
  }

  // Call NexHealth API
  const { data: response } = await fetchNexhealthAPI('/appointment_slots', subdomain, params);
  
  const slotsData: NexHealthAppointmentSlot[] = response.data;
  return slotsData;
}
```

**Creating Appointments:**
**File:** `lib/nexhealth.ts`
```typescript
export async function bookNexhealthAppointment(
  subdomain: string,
  locationId: string,
  patientId: number,
  slot: SlotData,
  state: ConversationState
): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  
  const body = {
    appt: {
      patient_id: patientId,
      provider_id: slot.providerId,
      operatory_id: slot.operatory_id,
      start_time: startTime.toISO(),
      end_time: endTime.toISO(),
      note: appointmentNote
    }
  };

  const { data } = await fetchNexhealthAPI(
    '/appointments',
    subdomain,
    { location_id: locationId },
    'POST',
    body
  );

  if (data?.data?.appt?.id) {
    return { success: true, bookingId: data.data.appt.id.toString() };
  } else {
    return { success: false, error: 'API response missing booking ID.' };
  }
}
```

---

## 4. Database Schema

### Core Tables

The database schema supports multi-tenancy through practice-based isolation:

#### Practice and Assistant Configuration

**File:** `prisma/schema.prisma`
```prisma
model Practice {
  id                            String                         @id @default(cuid())
  clerkUserId                   String                         @unique
  name                          String?
  nexhealthSubdomain            String?
  nexhealthLocationId           String?
  timezone                      String?
  // ... other practice configuration fields
  assistantConfig               PracticeAssistantConfig?
  callLogs                      CallLog[]
  toolLogs                      ToolLog[]
}

model PracticeAssistantConfig {
  id              String   @id @default(cuid())
  practiceId      String   @unique
  vapiAssistantId String?  @unique
  voiceProvider   String   @default("11labs")
  voiceId         String   @default("burt")
  systemPrompt    String   @default("You are a helpful AI assistant for a dental practice...")
  firstMessage    String   @default("Hello! This is Laine from your dental office...")
  practice        Practice @relation(fields: [practiceId], references: [id], onDelete: Cascade)
}
```

#### Call and State Management

```prisma
model CallLog {
  id                            String    @id @default(cuid())
  vapiCallId                    String    @unique
  practiceId                    String
  callTimestampStart            DateTime?
  callStatus                    String?
  transcriptText                String?
  nexhealthPatientId            String?
  bookedAppointmentNexhealthId  String?
  conversationState             Json?     // Primary state storage
  practice                      Practice  @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  toolLogs                      ToolLog[]
}

model ToolLog {
  id              String   @id @default(cuid())
  practiceId      String
  vapiCallId      String?
  toolName        String
  toolCallId      String
  arguments       String?  // Serialized input
  result          String?  // Serialized output
  success         Boolean
  error           String?
  executionTimeMs Int?
  apiResponses    Json?    // NexHealth API logs
  stateBefore     Json?    // State snapshot before execution
  practice        Practice @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  callLog         CallLog? @relation(fields: [vapiCallId], references: [vapiCallId], onDelete: Cascade)
}
```

#### Multi-Tenant Provider and Appointment Management

```prisma
model SavedProvider {
  id                       String                            @id @default(cuid())
  practiceId               String
  providerId               String
  isActive                 Boolean                           @default(true)
  acceptedAppointmentTypes ProviderAcceptedAppointmentType[]
  assignedOperatories      ProviderOperatoryAssignment[]
  practice                 Practice                          @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  provider                 Provider                          @relation(fields: [providerId], references: [id], onDelete: Cascade)

  @@unique([practiceId, providerId])
}

model AppointmentType {
  id                             String                            @id @default(cuid())
  practiceId                     String
  nexhealthAppointmentTypeId     String
  name                           String
  duration                       Int
  spokenName                     String?
  keywords                       String?
  practice                       Practice                          @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  acceptedByProviders            ProviderAcceptedAppointmentType[] @relation("ProviderAcceptedTypes")

  @@unique([practiceId, nexhealthAppointmentTypeId])
}
```

#### Token Caching

```prisma
model NexhealthTokenCache {
  id          String   @id @default("singleton")  // Global singleton pattern
  accessToken String
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Key Relationships

**Practice → Configuration:** One-to-one relationship between practices and VAPI assistants via `PracticeAssistantConfig`

**Practice → Providers:** Many-to-many through `SavedProvider` (allows selective provider activation per practice)

**Provider → AppointmentTypes:** Many-to-many through `ProviderAcceptedAppointmentType` (appointment type assignments)

**Provider → Operatories:** Many-to-many through `ProviderOperatoryAssignment` (operatory assignments)

### Multi-Tenant Considerations

- **Practice Isolation:** All data is properly namespaced by `practiceId`
- **Authentication Boundary:** Clerk user IDs provide practice-level authentication
- **No Global State:** No shared resources between practices in conversation state or configuration
- **Schema Support:** Database schema supports practice-specific configuration at all levels

**Critical Finding:** The current prototype is designed with multi-tenancy in mind, with proper practice isolation implemented throughout the database schema and application logic.

---

## Summary

The Laine AI prototype demonstrates sophisticated patterns for:

1. **Dynamic VAPI Configuration:** Tools and assistants are created programmatically with environment-specific URLs
2. **Stateful Conversation Management:** JSON-based state persistence enables complex, multi-step booking flows
3. **Hybrid AI Architecture:** Combines VAPI's conversational AI with specialized OpenAI functions for specific tasks
4. **Production-Ready Integration:** Robust NexHealth API integration with token caching and error handling
5. **Multi-Tenant Database Design:** Proper practice isolation with comprehensive relationship modeling

The architecture is well-positioned for production scaling with clear separation of concerns and extensible patterns for additional features.
