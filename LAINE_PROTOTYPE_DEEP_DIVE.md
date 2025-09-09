# LAINE PROTOTYPE DEEP DIVE

This document provides a comprehensive analysis of the Laine Integrated Next.js prototype, covering its architecture, data flow, state management, and external service integrations.

## 1. Core Call Flow & VAPI Integration

### 1a. Entry Point: VAPI Webhook Handler

The main webhook endpoint for VAPI call events is located at `app/api/vapi/webhook/route.ts`. This endpoint processes three key event types:

**Key Events Processed:**
- `status-update`: Updates call status and logs call metadata
- `end-of-call-report`: Records final call metrics and summary
- `transcript`: Stores real-time transcript updates

```typescript
// From app/api/vapi/webhook/route.ts
switch (messageType) {
  case "status-update":
    await handleStatusUpdate(body.message as VapiStatusUpdateMessage);
    break;
  
  case "end-of-call-report":
    await handleEndOfCallReport(body.message as VapiEndOfCallReportMessage);
    break;
  
  case "transcript":
    await handleTranscript(body.message as VapiTranscriptMessage);
    break;
}
```

### 1b. Tool Execution: VAPI Tool Calls Handler

Tool calls are processed through `app/api/vapi-webhook/route.ts` (not a separate tool-calls endpoint). This handler:

1. **Verifies** the incoming request (verification not fully implemented)
2. **Routes** tool calls to appropriate handlers via switch statement
3. **Manages** conversation state throughout the call
4. **Logs** all tool executions in the database

**Tool Routing Mechanism:**
```typescript
// From app/api/vapi-webhook/route.ts
switch (toolName) {
  case "findAppointmentType":
    handlerResult = await handleFindAppointmentType(state, toolArguments, toolCall.id);
    break;
  case "checkAvailableSlots":
    handlerResult = await handleCheckAvailableSlots(state, toolArguments, toolCall.id);
    break;
  case "identifyPatient":
    handlerResult = await handleIdentifyPatient(state, toolArguments, toolCall.id);
    break;
  case "selectAndBookSlot":
    handlerResult = await handleSelectAndBookSlot(state, toolArguments, toolCall.id);
    break;
  case "insuranceInfo":
    handlerResult = await handleInsuranceInfo(state, toolArguments, toolCall.id);
    break;
}
```

### 1c. Tool Logic: Core Business Logic Handlers

#### findAppointmentTypeHandler.ts
**Purpose**: Matches patient requests to appropriate appointment types using AI
**Key Features**:
- Uses AI-powered intent matching against appointment type keywords
- Generates acknowledgment messages for natural conversation flow
- Updates conversation state with booking details

```typescript
// Core logic from lib/tool-handlers/findAppointmentTypeHandler.ts
const matchedApptId = await matchAppointmentTypeIntent(
  patientRequest,
  dbAppointmentTypes.map(at => ({
    id: at.nexhealthAppointmentTypeId,
    name: at.name,
    keywords: at.keywords || "",
  }))
);

const newState = mergeState(currentState, {
  booking: {
    appointmentTypeId: matchedAppointmentType.nexhealthAppointmentTypeId,
    appointmentTypeName: matchedAppointmentType.name,
    spokenName: matchedAppointmentType.spokenName || matchedAppointmentType.name,
    duration: matchedAppointmentType.duration,
    isUrgent: matchedAppointmentType.check_immediate_next_available
  }
});
```

#### checkAvailableSlotsHandler.ts
**Purpose**: Finds available appointment slots with intelligent search strategies
**Key Features**:
- Proactive "first available" search by default
- Time bucket presentation for standard appointments
- Specific slot presentation for urgent appointments
- Date normalization using AI

```typescript
// Search strategy from lib/tool-handlers/checkAvailableSlotsHandler.ts
const searchResult = await findAvailableSlots(
  currentState.booking.appointmentTypeId,
  {
    id: practice.id,
    nexhealthSubdomain: practice.nexhealthSubdomain!,
    nexhealthLocationId: practice.nexhealthLocationId!,
    timezone: practice.timezone || 'America/Chicago'
  },
  searchDate,
  searchDays,
  timeBucket as TimeBucket
);
```

#### selectAndBookSlotHandler.ts
**Purpose**: Handles slot selection and final booking confirmation
**Key Features**:
- Two-stage process: selection then confirmation
- AI-powered slot matching against user selections
- Direct booking through NexHealth API
- Handles urgent flow (patient identification after slot selection)

```typescript
// Booking logic from lib/tool-handlers/selectAndBookSlotHandler.ts
const bookingResult = await bookNexhealthAppointment(
  practice.nexhealthSubdomain,
  practice.nexhealthLocationId,
  currentState.patient.id,
  matchedSlot,
  newStateWithSelection
);
```

#### identifyPatientHandler.ts
**Purpose**: Consolidates patient lookup and creation
**Key Features**:
- Searches existing patients by name and DOB
- Creates new patient records when needed
- Returns different messages based on patient status

```typescript
// Patient search logic from lib/tool-handlers/identifyPatientHandler.ts
const matchedPatient = patients.find(patient => {
  const recordDob = patient.bio?.date_of_birth;
  return typeof recordDob === 'string' && recordDob.trim() === args.dateOfBirth.trim();
});
```

#### insuranceInfoHandler.ts
**Purpose**: Provides insurance acceptance information
**Key Features**:
- Parses practice insurance list
- Generates AI-powered responses for specific or general queries

### 1d. State Management

**State Persistence**: Conversation state is maintained in the `CallLog.conversationState` JSON field throughout the call.

**State Structure** (from `types/laine.ts`):
```typescript
interface ConversationState {
  callId: string;
  practiceId: string;
  patient: {
    id?: number;
    status: 'UNKNOWN' | 'IDENTIFIED_EXISTING' | 'NEW_DETAILS_COLLECTED';
    isNameConfirmed: boolean;
    // ... other patient fields
  };
  booking: {
    appointmentTypeId?: string;
    appointmentTypeName?: string;
    duration?: number;
    isUrgent: boolean;
    presentedSlots: SlotData[];
    selectedSlot?: SlotData;
    // ... other booking fields
  };
  insurance: {
    status: 'NOT_CHECKED' | 'CHECKED';
  };
}
```

**State Flow**:
1. State is retrieved/initialized on each tool call
2. Tool handlers merge updates using `mergeState()` utility
3. Updated state is atomically saved to database
4. State is injected into system prompt for next assistant response

## 2. VAPI Assistant Configuration

### 2a. System Prompt

**Location**: `lib/system-prompt/laine_system_prompt.md`

**Complete System Prompt**:
```markdown
[Role]
You are Laine, a friendly, professional, and highly efficient AI receptionist for a dental practice. Your primary task is to have a natural, fluid conversation to book an appointment for a user.

[Context]
- Today's date is {{ "now" | date: "%A, %B %d, %Y", "America/Chicago" }}.
- Stay focused on the task of booking an appointment. Do not invent information.
- Never say the words 'function' or 'tool'.

[Guiding Principles]
- **CRITICAL COMMAND: ZERO FILLER:** This is your most important rule. You are strictly forbidden from using any language that narrates your internal process. NEVER say "Just a sec," "Give me a moment," "Hold on," "Let me check," or any similar phrases. Violating this rule will result in a failed call. Instead of speaking, simply pause for 1-2 seconds while the system works, and then deliver the result directly.
- **Always Drive the Conversation Forward:** After each step, your goal is to smoothly transition to the next logical question or action. Do not create awkward pauses.
- **Trust the Tool's Response:** The tools are designed to guide you. If a tool provides a specific message to relay to the user, deliver it accurately. It contains the correct next step.
- **Be Persistent but Polite:** When collecting information, you must be persistent to ensure data accuracy, but always maintain a polite and helpful tone.
- **Never Narrate Your Process:** Do not say "I am checking the schedule," "accessing my tools," or "running a search." The user should not be aware that you are using "tools." Simply pause for a moment while the tool runs, and then deliver the result of the action.

[Response Guidelines]
- Keep responses brief and natural. Ask one question at a time.
- Maintain a calm, empathetic, and professional tone.
- Present dates clearly (e.g., "Wednesday, July 23rd").
- Present times clearly (e.g., "ten ten AM").

[Error Handling]
- If you encounter a generic system error from a tool, inform the user politely that there was a technical issue and that a staff member will call them back shortly. Do not try to use the tool again.
    - **Phone Number Errors:** If the `identifyPatient` tool fails specifically because of an invalid phone number, you MUST use the following script: "I'm sorry, I think we may have had a bad connection for a moment. The number I heard was [the number you collected]. Could you please repeat it for me?" This frames the error as a system issue, not a user mistake.

[Handling Off-Topic Questions]
- The user may ask questions not directly related to booking, like about insurance. Your goal is to answer their question helpfully and then gently guide them back to the main task.
- **Insurance Questions:** If the user asks about insurance, you MUST use the `insuranceInfo` tool.
    - If they ask about a specific plan (e.g., "Do you take Cigna?"), provide their query in the `insuranceName` parameter.
    - After the tool provides the answer, you MUST ask a follow-up question to return to the booking flow.
    - **Example Transition:** "I hope that helps! Was there an appointment I could help you schedule today?"
    - **Out-of-Network Proactivity:** If the `insuranceInfo` tool confirms a patient is out-of-network, you MUST immediately pivot the conversation back to scheduling. After delivering the reassuring message, ask: "So, what kind of visit were you looking to schedule today?" Do not wait for the user to prompt you. Always drive the conversation forward.

---
[CONVERSATIONAL FLOW]
This is your master guide. Follow these steps in order.

**Step 1: Understand the Need**
- Your first goal is to understand why the user is calling (e.g., "How can I help you today?").
- If the caller says "I need to schedule an appointment." ask them what they specifically want to come in for.
- Once you have their reason, you MUST immediately call the `findAppointmentType` tool.
- **NOTE:** For urgent appointments, the system will automatically search for the earliest available times. Your job is to deliver the acknowledgment message, and then present the time slots that the next tool provides.
- **Transition:** After `findAppointmentType` succeeds, the tool will provide an `acknowledgment` phrase. You MUST use this phrase to start your next sentence before proceeding to **Step 2: Identify the Patient**. 
  - **Example:** If the acknowledgment is "Of course, we can get that scheduled," your next line should be: "We can get that scheduled. To get started, are you a new or existing patient?"

**Step 2: Identify the Patient**
- **NOTE:** For urgent appointments, you will perform this step *after* a time slot has been selected in Step 4.
- After understanding the need, your default assumption is that the user might be new. Ask: "To get started, are you a new or existing patient?"

- **IF THE USER IS AN EXISTING PATIENT:**
[IMPORTANT NOTE: For an existing patient, only collect full name and DOB]
    1.  **Acknowledge:** Say "Great, let's look up your file."
    2.  **Collect Name:** Ask for their first and last name.
    3.  **Verify Name Spelling Intelligently:** After the user provides their name, use your judgment. If a name seems common (e.g., John Smith), you can proceed. If a name seems uncommon or you are unsure of the spelling (e.g., Deren Flesher), ask for clarification on the specific part you're unsure about.
        **Example:** "Deren, got it. Could you spell that first name for me just to be sure?"
        Your goal is to ensure accuracy without sounding like a robot.
    4.  **Collect DOB:** After the name is confirmed, ask for their date of birth.
    5.  **Verify DOB:** After they respond, you MUST repeat it back for confirmation. Example: "Thank you. And just to confirm, your date of birth is October 30th, 1998?"
    6.  **Execute Identification:** Once you have high confidence in the spelling and have collected all information, call the `identifyPatient` tool with all the details.
    7.  The tool's response will guide you. Deliver its message to the user.
    8.  **Transition:** After `identifyPatient` succeeds, the patient is now identified. Your next immediate action is to proceed to **Step 3: Find an Appointment Time**.

- **IF THE USER IS A NEW PATIENT (or is unsure):**
    1. **Inform:** Tell the user you need to collect a few details to create their file.
    2. **Collect Name & Verify Spelling Intelligently:** Ask for their first and last name. After the user provides their name, use your judgment. If a name seems common (e.g., John Smith), you can proceed. If a name seems uncommon or you are unsure of the spelling (e.g., Deren Flesher), ask for clarification on the specific part you're unsure about.
        **Example:** "Deren, got it. Could you spell that first name for me just to be sure?"
        Your goal is to ensure accuracy without sounding like a robot. Only after you have high confidence in the spelling should you proceed.
    3. **Collect DOB & Verify:** Ask for their date of birth and repeat it back for confirmation.
    4. **Collect Phone:** Ask for their 10-digit phone number. You should accept any 10 or 11-digit number without challenging the user unless it's obviously invalid.
    5. **Collect Email & Verify Spelling:** Ask for their email address. After they respond, you MUST ask them to spell it out.
    6. **Execute Identification:** After collecting ALL of the above information, you MUST call the `identifyPatient` tool.
    7. **Transition:** After `identifyPatient` succeeds, the patient is now identified. Your next immediate action is to proceed to **Step 3: Find an Appointment Time**.

**Step 3: Find an Appointment Time**
- Your goal is to find an available time. **Proactively offer to find the next available appointment.**
- **Example:** "Okay, let me find the next available time for your cleaning."
- Call the `checkAvailableSlots` tool without any parameters for the default "first available" search.
- Only ask for a preferred day or time if the user volunteers it first or rejects the initial "first available" options.
- Present the options returned by the tool clearly to the user.

**Handling Delayed Availability:** If the `checkAvailableSlots` tool returns a result with `isDelayedAvailability: true`, you MUST be transparent with the user. Do not just offer the future date. First, explain the situation clearly.

**Example:** "It looks like our next available appointment for a cleaning isn't until Monday, August 11th. I have an 8:20 AM slot available then. Would that work for you?"

**Step 4: Select, Confirm, and Book the Slot**
- Once the user chooses a time from the options you provided, you MUST call the `selectAndBookSlot` tool with their `userSelection`. The tool will ask you to get final confirmation.
- Deliver the confirmation message to the user (e.g., "Just to confirm, I have you down for... Is that correct?").
- After the user says 'yes' or confirms, you MUST call the `selectAndBookSlot` tool a **second time**, but now you must also include `finalConfirmation: true`. This will finalize the booking.
- **CRITICAL:** The tool's response will be different depending on the situation. If a patient has not been identified yet (the urgent flow), the tool will ask you to get the patient's details before proceeding with the booking.

**Step 5: Close the Call**
- After the booking is confirmed, ask if there is anything else you can help with and then end the call.
```

### 2b. Tool Definitions

**Location**: `lib/tools/definitions/` directory

**Complete Tool Schema Collection**:

#### findAppointmentType Tool
```typescript
// lib/tools/definitions/findAppointmentTypeTool.ts
export function getFindAppointmentTypeTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "findAppointmentType",
      description: "Identifies the patient's need (e.g., 'toothache', 'cleaning') and determines the correct appointment type. **This is always the first tool to call in a conversation.**",
      parameters: {
        type: "object" as const,
        properties: {
          patientRequest: {
            type: "string" as const,
            description: "The patient's verbatim description of their reason for calling, their symptoms, or the type of appointment they are requesting. For example, 'I have a toothache', 'I need a cleaning', or 'My crown fell off and I need it re-cemented'."
          }
        },
        required: ["patientRequest"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,
    }
  };
}
```

#### checkAvailableSlots Tool
```typescript
// lib/tools/definitions/checkAvailableSlotsTool.ts
export function getCheckAvailableSlotsTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "checkAvailableSlots",
      description: "Finds available appointment times. By default, proactively searches for the next available appointments. Call this after the appointment type is known. Only include parameters if the user has specifically expressed preferences.",
      parameters: {
        type: "object" as const,
        properties: {
          preferredDaysOfWeek: {
            type: "string" as const,
            description: "A JSON string array of the user's preferred days of the week. Example: '[\"Monday\", \"Wednesday\"]'. This is collected from the user."
          },
          timeBucket: {
            type: "string" as const,
            description: "The user's general time preference, which must be one of the following values: 'Early', 'Morning', 'Midday', 'Afternoon', 'Evening', 'Late', or 'AllDay'. This is collected from the user."
          },
          requestedDate: {
            type: "string" as const,
            description: "The user's specific requested date, like 'tomorrow', 'next Wednesday', or 'July 10th'. Use this for specific date searches."
          }
        },
        required: []
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,
    }
  };
}
```

#### identifyPatient Tool
```typescript
// lib/tools/definitions/identifyPatientTool.ts
export function getIdentifyPatientTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "identifyPatient",
      description: "Identifies an existing patient or creates a new patient record. Use this after collecting the patient's full name, date of birth, and other contact details.",
      parameters: {
        type: "object" as const,
        properties: {
          firstName: { 
            type: "string" as const, 
            description: "The patient's first name." 
          },
          lastName: { 
            type: "string" as const, 
            description: "The patient's last name." 
          },
          dateOfBirth: { 
            type: "string" as const, 
            description: "The patient's date of birth in YYYY-MM-DD format." 
          },
          phoneNumber: { 
            type: "string" as const, 
            description: "The patient's phone number (required for new patients)." 
          },
          email: { 
            type: "string" as const, 
            description: "The patient's email address (required for new patients)." 
          },
        },
        required: ["firstName", "lastName", "dateOfBirth", "phoneNumber", "email"],
      },
    },
    server: { 
      url: `${appBaseUrl}/api/vapi-webhook`,
      timeoutSeconds: 30
    }
  };
}
```

#### selectAndBookSlot Tool
```typescript
// lib/tools/definitions/selectAndBookSlotTool.ts
export function getSelectAndBookSlotTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "selectAndBookSlot",
      description: "Selects a time slot and, with final user confirmation, books the appointment. This is the final step in the booking process. Call once with user's selection, then again with finalConfirmation=true after they confirm.",
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
      url: `${appBaseUrl}/api/vapi-webhook`,
    }
  };
}
```

#### insuranceInfo Tool
```typescript
// lib/tools/definitions/insuranceInfoTool.ts
export function getInsuranceInfoTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "insuranceInfo",
      description: "Answers patient questions about dental insurance acceptance. Use for general questions like 'What insurance do you take?' or specific questions like 'Do you accept Cigna?'",
      parameters: {
        type: "object" as const,
        properties: {
          insuranceName: {
            type: "string" as const,
            description: "The specific name of the insurance plan the user is asking about. Omit this for general questions."
          }
        },
        required: []
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi-webhook`,
    }
  };
}
```

### 2c. Tool Aggregation

**Location**: `lib/tools/index.ts`

```typescript
// Central tool definition mapping
export const toolDefinitionMap = {
  findAppointmentType: getFindAppointmentTypeTool,
  identifyPatient: getIdentifyPatientTool,
  checkAvailableSlots: getCheckAvailableSlotsTool,
  selectAndBookSlot: getSelectAndBookSlotTool,
  insuranceInfo: getInsuranceInfoTool,
};

// Aggregate all tool definitions for VAPI assistant configuration
export function getAllTools(appBaseUrl: string): VapiTool[] {
  const tools: VapiTool[] = Object.values(toolDefinitionMap).map(getToolFn => getToolFn(appBaseUrl));
  return tools;
}
```

### 2d. Assistant Provisioning

**Primary Script**: `scripts/create-laine-assistant.js` - Creates basic assistant with patient registration tool
**Tool Configuration**: `scripts/add-tools-to-assistant.js` - Adds the complete tool suite to an existing assistant

**Key Configuration Requirements**:
- `VAPI_API_KEY`: For VAPI API authentication
- `NEXT_PUBLIC_APP_URL`: Base URL for webhook endpoints
- `NEXHEALTH_API_KEY`: For NexHealth integration
- Practice-specific NexHealth subdomain and location ID

## 3. Data Model

### 3a. Complete Prisma Schema

**Location**: `prisma/schema.prisma`

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum PatientWebStatus {
  NEW
  RETURNING
  BOTH
}

model Practice {
  id                            String                         @id @default(cuid())
  clerkUserId                   String                         @unique
  name                          String?
  nexhealthSubdomain            String?
  nexhealthLocationId           String?
  webhookLastSyncAt             DateTime?
  webhookLastSuccessfulSyncAt   DateTime?
  webhookSyncErrorMsg           String?
  address                       String?
  acceptedInsurances            String?
  serviceCostEstimates          String?
  timezone                      String?
  lunchBreakStart               String?
  lunchBreakEnd                 String?
  minBookingBufferMinutes       Int?                           @default(60)
  slug                          String?                        @unique
  createdAt                     DateTime                       @default(now())
  updatedAt                     DateTime                       @updatedAt
  appointmentTypes              AppointmentType[]
  callLogs                      CallLog[]
  nexhealthWebhookSubscriptions NexhealthWebhookSubscription[]
  assistantConfig               PracticeAssistantConfig?
  providers                     Provider[]
  toolLogs                      ToolLog[]
  savedOperatories              SavedOperatory[]
  savedProviders                SavedProvider[]
  webBookings                   WebBooking[]
}

model SavedProvider {
  id                       String                            @id @default(cuid())
  practiceId               String
  providerId               String
  isActive                 Boolean                           @default(true)
  createdAt                DateTime                          @default(now())
  updatedAt                DateTime                          @updatedAt
  acceptedAppointmentTypes ProviderAcceptedAppointmentType[]
  assignedOperatories      ProviderOperatoryAssignment[]
  practice                 Practice                          @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  provider                 Provider                          @relation(fields: [providerId], references: [id], onDelete: Cascade)

  @@unique([practiceId, providerId])
  @@map("saved_providers")
}

model ProviderAcceptedAppointmentType {
  id                String          @id @default(cuid())
  savedProviderId   String
  appointmentTypeId String
  createdAt         DateTime        @default(now())
  appointmentType   AppointmentType @relation("ProviderAcceptedTypes", fields: [appointmentTypeId], references: [id], onDelete: Cascade)
  savedProvider     SavedProvider   @relation(fields: [savedProviderId], references: [id], onDelete: Cascade)

  @@unique([savedProviderId, appointmentTypeId])
  @@map("provider_accepted_appointment_types")
}

model ProviderOperatoryAssignment {
  id               String         @id @default(cuid())
  savedProviderId  String
  savedOperatoryId String
  createdAt        DateTime       @default(now())
  savedOperatory   SavedOperatory @relation(fields: [savedOperatoryId], references: [id], onDelete: Cascade)
  savedProvider    SavedProvider  @relation(fields: [savedProviderId], references: [id], onDelete: Cascade)

  @@unique([savedProviderId, savedOperatoryId])
  @@map("provider_operatory_assignments")
}

model SavedOperatory {
  id                   String                        @id @default(cuid())
  practiceId           String
  nexhealthOperatoryId String
  name                 String
  isActive             Boolean                       @default(true)
  createdAt            DateTime                      @default(now())
  updatedAt            DateTime                      @updatedAt
  assignedToProviders  ProviderOperatoryAssignment[]
  practice             Practice                      @relation(fields: [practiceId], references: [id], onDelete: Cascade)

  @@unique([practiceId, nexhealthOperatoryId])
  @@map("saved_operatories")
}

model PracticeAssistantConfig {
  id              String   @id @default(cuid())
  practiceId      String   @unique
  vapiAssistantId String?  @unique
  voiceProvider   String   @default("11labs")
  voiceId         String   @default("burt")
  systemPrompt    String   @default("You are a helpful AI assistant for a dental practice. Your primary goal is to assist patients. Be polite and efficient.")
  firstMessage    String   @default("Hello! This is Laine from your dental office. How can I help you today?")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  practice        Practice @relation(fields: [practiceId], references: [id], onDelete: Cascade)
}

model GlobalNexhealthWebhookEndpoint {
  id                  String   @id @default("singleton")
  nexhealthEndpointId String   @unique
  secretKey           String
  targetUrl           String
  isEnabled           Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model NexhealthWebhookSubscription {
  id                         String   @id @default(cuid())
  practiceId                 String
  nexhealthWebhookEndpointId String
  nexhealthSubscriptionId    String   @unique
  resourceType               String
  eventName                  String
  isActive                   Boolean  @default(true)
  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt
  practice                   Practice @relation(fields: [practiceId], references: [id], onDelete: Cascade)

  @@unique([practiceId, resourceType, eventName])
}

model CallLog {
  id                            String    @id @default(cuid())
  vapiCallId                    String    @unique
  practiceId                    String
  callTimestampStart            DateTime?
  callStatus                    String?
  transcriptText                String?
  summary                       String?
  vapiTranscriptUrl             String?
  detectedIntent                String?
  nexhealthPatientId            String?
  bookedAppointmentNexhealthId  String?
  conversationState             Json?
  patientStatus                 String?
  originalPatientRequestForType String?
  assistantId                   String?
  endedReason                   String?
  callDurationSeconds           Int?
  cost                          Decimal?
  createdAt                     DateTime  @default(now())
  updatedAt                     DateTime  @updatedAt
  practice                      Practice  @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  toolLogs                      ToolLog[]
}

model ToolLog {
  id              String   @id @default(cuid())
  practiceId      String
  vapiCallId      String?
  toolName        String
  toolCallId      String
  arguments       String?
  result          String?
  success         Boolean
  error           String?
  executionTimeMs Int?
  apiResponses    Json?    @db.Json
  stateBefore     Json?    @db.Json
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  practice        Practice @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  callLog         CallLog? @relation(fields: [vapiCallId], references: [vapiCallId], onDelete: Cascade)

  @@index([practiceId, toolName])
  @@index([vapiCallId])
}

model AppointmentType {
  id                             String                            @id @default(cuid())
  practiceId                     String
  nexhealthAppointmentTypeId     String
  name                           String
  duration                       Int
  bookableOnline                 Boolean?
  spokenName                     String?
  check_immediate_next_available Boolean                           @default(false)
  keywords                       String?
  parentType                     String?
  parentId                       String?
  lastSyncError                  String?
  webPatientStatus               PatientWebStatus                  @default(BOTH)
  createdAt                      DateTime                          @default(now())
  updatedAt                      DateTime                          @updatedAt
  practice                       Practice                          @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  acceptedByProviders            ProviderAcceptedAppointmentType[] @relation("ProviderAcceptedTypes")
  webBookings                    WebBooking[]

  @@unique([practiceId, nexhealthAppointmentTypeId])
}

model Provider {
  id                  String          @id @default(cuid())
  practiceId          String
  nexhealthProviderId String
  firstName           String?
  lastName            String
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  practice            Practice        @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  savedByPractices    SavedProvider[]

  @@unique([practiceId, nexhealthProviderId])
}

model NexhealthTokenCache {
  id          String   @id @default("singleton")
  accessToken String
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model WebBooking {
  id                  String    @id @default(cuid())
  practiceId          String
  appointmentTypeId   String
  status              String    // e.g., "COMPLETED", "ABANDONED"
  
  // Patient Info
  patientFirstName    String
  patientLastName     String
  patientDob          String?   // Optional as it might not be collected for new patients initially
  patientEmail        String
  patientPhone        String
  patientStatus       String    // "NEW" or "RETURNING"
  
  // Appointment Info
  selectedSlotTime    DateTime
  notes               String?
  nexhealthBookingId  String?   @unique
  nexhealthPatientId  String?
  
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  practice            Practice        @relation(fields: [practiceId], references: [id], onDelete: Cascade)
  appointmentType     AppointmentType @relation(fields: [appointmentTypeId], references: [id], onDelete: Cascade)

  @@index([practiceId])
  @@index([appointmentTypeId])
}
```

### 3b. Key Model Relationships

**Practice → CallLog**: One-to-many relationship where each practice can have multiple call logs
- **Link**: `CallLog.practiceId` → `Practice.id`
- **Purpose**: Track all voice interactions per practice

**CallLog → ToolLog**: One-to-many relationship for tracking tool executions within calls
- **Link**: `ToolLog.vapiCallId` → `CallLog.vapiCallId`
- **Purpose**: Detailed audit trail of all tool usage during calls

**Practice → AppointmentType**: One-to-many relationship for practice-specific appointment types
- **Link**: `AppointmentType.practiceId` → `Practice.id`
- **Purpose**: Each practice manages its own appointment type catalog

**Provider Relationships**: Complex many-to-many structure
- `Practice` → `Provider`: One-to-many base provider records
- `Practice` → `SavedProvider`: Practice-specific provider configurations
- `SavedProvider` → `ProviderAcceptedAppointmentType`: Provider's accepted appointment types
- `SavedProvider` → `ProviderOperatoryAssignment`: Provider's assigned operatories

**State Management**: 
- `CallLog.conversationState` (JSON) stores the complete conversation state
- State is retrieved and updated on each tool call
- `ToolLog.stateBefore` captures state snapshots for debugging

## 4. NexHealth Integration

### 4a. Authentication & Client

**Location**: `lib/nexhealth.ts`

**Authentication Flow**:
1. **Token Management**: Uses cached bearer tokens with automatic refresh
2. **Master API Key**: Stored in `NEXHEALTH_API_KEY` environment variable
3. **Token Exchange**: Exchanges master key for bearer tokens via `/authenticates` endpoint

```typescript
// Token caching logic from lib/nexhealth.ts
export async function getNexhealthBearerToken(): Promise<string> {
  const cachedToken = await prisma.nexhealthTokenCache.findUnique({
    where: { id: TOKEN_CACHE_ID },
  });

  if (cachedToken) {
    const now = new Date();
    const tokenStillValidUntil = addSeconds(now, TOKEN_EXPIRY_BUFFER_SECONDS);
    
    if (cachedToken.expiresAt > tokenStillValidUntil) {
      return cachedToken.accessToken;
    }
  }

  // Fetch new token if none cached or expired
  const { accessToken } = await fetchNewBearerToken();
  return accessToken;
}
```

**API Client**: Generic `fetchNexhealthAPI()` function handles all NexHealth API calls
- Automatic bearer token management
- Practice subdomain injection
- Request/response logging
- Automatic retry on 401 errors

### 4b. Data Synchronization

**Manual Sync Endpoint**: `app/api/sync-nexhealth/route.ts`

**Sync Process**:
1. **Fetch** providers, operatories, and appointment types from NexHealth
2. **Upsert** providers and operatories to local database
3. **Sync** appointment types with error handling per type
4. **Track** creation vs. update counts for reporting

```typescript
// Core sync logic from app/api/sync-nexhealth/route.ts
const [providers, operatories] = await Promise.all([
  getProviders(practice.nexhealthSubdomain, practice.nexhealthLocationId),
  getOperatories(practice.nexhealthSubdomain, practice.nexhealthLocationId),
]);

await syncPracticeAppointmentTypes(
  practice.id,
  practice.nexhealthSubdomain,
  practice.nexhealthLocationId
);
```

**Key Sync Features**:
- New operatories default to `isActive: false` for manual configuration
- Providers automatically upserted with name updates
- Appointment types sync with individual error tracking

### 4c. NexHealth Webhooks

**Webhook Endpoint**: `app/api/nexhealth-webhook/route.ts`

**Security**: 
- HMAC SHA256 signature verification using stored secret key
- Timing-safe comparison to prevent timing attacks
- Comprehensive error logging

**Supported Events**:
```typescript
// Event handling from app/api/nexhealth-webhook/route.ts
if (resource_type === "Patient") {
  if (event_name === "patient_created") {
    // TODO: Upsert patient data into local Patient table
  } else if (event_name === "patient_updated") {
    // TODO: Update local patient data
  }
} else if (resource_type === "Appointment") {
  if (event_name === "appointment_created") {
    // TODO: Sync new appointment to local database
  } else if (event_name === "appointment_insertion.complete") {
    // TODO: Mark appointment as confirmed in local DB
  } else if (event_name === "appointment_insertion.failed") {
    // TODO: Handle booking failure, notify practice or retry
  }
}
```

**Practice Resolution**: Webhooks are matched to practices via NexHealth subdomain
**State Tracking**: Updates practice webhook sync timestamps and error states

## 5. Practice Onboarding & Configuration UI

### 5a. Configuration Flow

**Main Configuration Page**: `app/practice-config/page.tsx`

**Setup Sequence**:
1. **Basic Information**: Practice name, NexHealth credentials, address, insurance info
2. **Data Sync**: Pull providers, operatories, and appointment types from NexHealth
3. **Appointment Type Configuration**: Set keywords, spoken names, urgency flags
4. **Provider Configuration**: Activate providers and assign appointment types/operatories
5. **Testing Tools**: Check slot availability and validate configuration

**Authentication Guard**: Uses Clerk middleware to protect configuration routes
```typescript
// From middleware.ts
const isProtectedRoute = createRouteMatcher([
  '/practice-config(.*)',
  '/laine-web/appointments(.*)',
  '/test(.*)',
]);
```

### 5b. Appointment Type Configuration

**Component**: `app/practice-config/AppointmentTypesConfig.tsx`
**API Endpoints**: `app/api/practice-config/appointment-types/`

**Configuration Features**:
- **Create/Edit/Delete** appointment types directly in Laine (not synced from NexHealth)
- **Spoken Names**: Alternative names for voice recognition
- **Keywords**: Comma-separated intent matching keywords
- **Urgency Flags**: Mark types as requiring immediate next available slot
- **Web Patient Status**: NEW/RETURNING/BOTH - controls web booking eligibility

**API Integration**:
- `POST /api/practice-config/appointment-types/` - Create new type
- `PUT /api/practice-config/appointment-types/[id]` - Update existing type
- `DELETE /api/practice-config/appointment-types/[id]` - Delete type

### 5c. Provider Configuration

**Component**: `app/practice-config/ProvidersConfig.tsx`
**API Endpoints**: `app/api/practice-config/providers/` and `app/api/practice-config/provider-settings/`

**Configuration Features**:
- **Provider Activation**: Enable/disable providers for Laine booking
- **Appointment Type Assignment**: Define which appointment types each provider accepts
- **Operatory Assignment**: Assign providers to specific operatories
- **Batch Operations**: Activate multiple providers simultaneously

**Configuration Flow**:
1. **Sync** providers from NexHealth (creates base Provider records)
2. **Activate** providers (creates SavedProvider records with isActive: true)
3. **Configure** provider settings (appointment types and operatories via junction tables)

## 6. Authentication & Multi-Tenancy

### 6a. Authentication System

**Provider**: Clerk authentication service
**Configuration**: `middleware.ts` protects admin routes

**User Identity Resolution**: 
```typescript
// Standard pattern across API routes
const { userId } = await auth();
if (!userId) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Protected Routes**:
- `/practice-config/*` - Administrative configuration
- `/laine-web/appointments/*` - Appointment management views  
- `/test/*` - Testing utilities

### 6b. Multi-Tenancy Implementation

**Tenant Isolation**: Each practice is linked to a Clerk user via `Practice.clerkUserId`

**Data Access Pattern**:
```typescript
// Example from app/api/practice-config/data/route.ts  
const practice = await prisma.practice.findUnique({ 
  where: { clerkUserId: userId },
  include: {
    appointmentTypes: true,
    providers: true,
    savedProviders: true,
    savedOperatories: true
  }
});
```

**Tenant Scoping**: All data queries are scoped by practice ID to ensure data isolation
**VAPI Integration**: Practice association handled via `PracticeAssistantConfig.vapiAssistantId`

## 7. Environment & Configuration

### 7a. Required Environment Variables

Based on code analysis, the following environment variables are required:

**Core Application**:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_APP_URL` - Application base URL for webhooks

**Authentication (Clerk)**:
- `CLERK_SECRET_KEY` - Clerk authentication secret
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key

**VAPI Integration**:
- `VAPI_API_KEY` - VAPI service API key

**NexHealth Integration**:
- `NEXHEALTH_API_BASE_URL` - NexHealth API endpoint (defaults to production)
- `NEXHEALTH_API_KEY` - Master NexHealth API key for token exchange

**Optional Configuration**:
- Practice timezone (stored in database, defaults to 'America/Chicago')
- Voice provider settings (stored in PracticeAssistantConfig)

### 7b. Key Configuration Files

**Database**: `prisma/schema.prisma` - Complete data model
**Tools**: `lib/tools/index.ts` - VAPI tool definitions aggregation  
**System Prompt**: `lib/system-prompt/laine_system_prompt.md` - Assistant behavior definition
**Types**: `types/laine.ts` and `types/vapi.ts` - TypeScript type definitions
**Middleware**: `middleware.ts` - Route protection and authentication

---

## Summary

The Laine prototype is a sophisticated voice-first appointment booking system built on Next.js with deep integrations to VAPI for voice AI and NexHealth for practice management. The architecture demonstrates:

1. **Stateful Conversation Management**: Comprehensive state tracking across multi-turn voice conversations
2. **AI-Powered Intent Recognition**: Sophisticated matching of patient requests to appointment types
3. **Real-time External API Integration**: Seamless integration with NexHealth for patient data and appointment booking
4. **Robust Error Handling**: Graceful degradation and user-friendly error messages
5. **Multi-tenant Architecture**: Complete data isolation and configuration per practice
6. **Comprehensive Audit Trail**: Full logging of all tool executions and API calls

The codebase provides an excellent foundation for understanding modern conversational AI applications and serves as a strong prototype for scaling to production multi-tenant SaaS architecture.
