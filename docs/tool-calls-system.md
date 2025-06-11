# LAINE Tool Call System Documentation

## Overview

The LAINE AI Assistant uses a sophisticated tool call system to interact with dental practice management systems (NexHealth) and provide intelligent patient assistance. This system consists of a centralized webhook handler and 8 specialized tools that handle everything from patient lookup to appointment booking.

## Architecture

### Core Components

1. **Central Webhook Handler**: `app/api/vapi/tool-calls/route.ts`
2. **Tool Definitions**: `lib/tools/*.ts` (8 individual tools)
3. **Type System**: `lib/tools/types.ts`
4. **Tool Registry**: `lib/tools/index.ts`

## Webhook Handler: `/api/vapi/tool-calls`

### Purpose
Central endpoint that receives tool call requests from VAPI and executes the appropriate tools with practice context.

### Request Flow
```
VAPI Assistant → Tool Call Webhook → Extract Assistant ID → Find Practice → Execute Tool → Dynamic Response → Immediate Spoken Output
```

### Key Features

#### 1. Practice Resolution
- Extracts assistant ID from VAPI payload
- Maps assistant to practice using `PracticeAssistantConfig`
- Includes fallback mechanisms for name-based lookup
- Loads complete practice context with scheduling data

#### 2. Enhanced Transcript Processing
For `book_appointment` tool calls:
- Extracts call transcripts from multiple payload locations
- Constructs transcripts from message arrays when direct transcript unavailable
- Generates AI-powered appointment summaries using GPT-4o

#### 3. Dynamic Message Handling (Phase 1.4)
**NEW**: All tools now use dynamic spoken responses instead of static messages.

**Success Response Structure:**
```json
{
  "toolCallId": "abc123",
  "result": "{\"data\": {...}}",
  "message": {
    "type": "request-complete",
    "content": "Dynamic message from tool's message_to_patient"
  }
}
```

**Failure Response Structure:**
```json
{
  "toolCallId": "abc123", 
  "error": "ERROR_CODE or details",
  "message": {
    "type": "request-failed",
    "content": "Dynamic error message from tool's message_to_patient"
  }
}
```

#### 4. Comprehensive Logging
- Practice lookup debugging
- Tool execution timing
- Transcript extraction details
- Dynamic message preparation tracking

### Error Handling
- Graceful fallbacks for missing practice data
- Structured error responses for VAPI
- Debug information in development mode
- Call log status tracking

## Tool System Architecture

### Base Types (`lib/tools/types.ts`)

#### ToolResult Interface
```typescript
interface ToolResult {
  success: boolean;
  message_to_patient: string;  // Primary spoken content
  data?: Record<string, unknown>;
  error_code?: string;
  details?: string;
}
```

#### ToolDefinition Interface
```typescript
interface ToolDefinition<T extends z.ZodType<any, any>> {
  name: string;
  description: string;
  schema: T;
  run: (params) => Promise<ToolResult>;
  messages?: {
    start?: string;    // Before execution
    success?: string;  // Fallback only
    fail?: string;     // Fallback only
  };
}
```

### Message Flow Evolution

#### Phase 1.3 (get_practice_details only)
Only `get_practice_details` used dynamic messages.

#### Phase 1.4 (All Tools) 
**Current State**: All tools use dynamic `message_to_patient` for immediate spoken output.

**Static Message Role Change:**
- `start`: Still used (spoken before execution)
- `success`/`fail`: Now generic fallbacks only

## Individual Tools Documentation

### 1. Patient Management Tools

#### `find_patient` - Patient Lookup
**Purpose**: Search for existing patients in NexHealth EHR

**Input Schema**:
```typescript
{
  firstName: string,
  lastName: string, 
  dateOfBirth: string // YYYY-MM-DD format
}
```

**Key Features**:
- Fuzzy name matching for slight variations
- Date of birth validation
- Updates call log with patient ID when found

**Success Message Example**:
> "Great! I found John Smith, born January 15, 1985. What type of appointment would you like to schedule today?"

**Static Messages**:
- Start: "Let me look that up for you..."
- Success: "The patient search is complete." *(fallback)*
- Fail: "I'm having trouble finding that record. Let me help you with that."

---

#### `create_new_patient` - Patient Registration
**Purpose**: Create new patient records in NexHealth EHR

**Input Schema**:
```typescript
{
  firstName: string,
  lastName: string,
  dateOfBirth: string, // YYYY-MM-DD
  phone: string,
  email: string,
  insurance_name?: string // Optional
}
```

**Key Features**:
- Comprehensive pre-validation to prevent premature calls
- Phone number formatting and validation (10+ digits)
- Email format validation
- Optional insurance information capture
- Enhanced error handling for duplicates

**Success Message Examples**:
> "Perfect! I've successfully created your patient profile for John Smith. Welcome to Royal Oak Family Dental! Now, what type of appointment were you looking to schedule today?"

*With Insurance*:
> "Perfect! I've successfully created your patient profile for John Smith. I've also noted your Cigna insurance. To make sure we have all the details, could you provide the subscriber's full name on that policy?"

**Static Messages**:
- Start: "Let me gather the information needed to create your patient record..."
- Success: "The patient record creation is complete." *(fallback)*
- Fail: "I need some additional information to complete your registration."

### 2. Appointment Discovery Tools

#### `find_appointment_type` - Service Matching
**Purpose**: Match patient requests to available appointment types

**Input Schema**:
```typescript
{
  userRequest: string // e.g., "cleaning", "toothache", "consultation"
}
```

**Key Features**:
- Intelligent fuzzy matching using string similarity scoring
- Keyword-based matching for common dental terms
- Fallback to presenting available options when no good match
- Duration information included

**Success Message Examples**:
*Good Match*:
> "Perfect! I can schedule you for a Routine Cleaning which takes 60 minutes. What day would you like to come in?"

*No Match - Present Options*:
> "I want to make sure I schedule the right appointment for you. We offer Routine Cleaning, New Patient Exam, Emergency Visit. Which of these best describes what you need?"

**Static Messages**:
- Start: "Let me find the right appointment type for you..."
- Success: "The appointment type search is complete." *(fallback)*
- Fail: "Let me check what appointment types we have available."

---

#### `check_available_slots` - Availability Search
**Purpose**: Find available appointment times for specific dates and types

**Input Schema**:
```typescript
{
  requestedDate: string, // YYYY-MM-DD
  appointmentTypeId: string,
  days: number // Optional, defaults to 1
}
```

**Key Features**:
- Multi-provider and operatory support
- Timezone handling (Central Time)
- Intelligent slot presentation (limits to 3-4 initial options for voice)
- Conversational availability messaging
- No-availability alternative suggestions

**Success Message Examples**:
*Slots Available*:
> "Okay! For a New Patient Cleaning on Tuesday, December 10th, I have 9:00 AM, 1:30 PM, or 3:45 PM available. Which of those times works best for you?"

*Many Slots*:
> "Okay! For a Routine Cleaning on Friday, December 13th, I have 9:00 AM, 11:30 AM, or 2:00 PM available. I also have a few other times that day. Do any of those I mentioned work, or would you like to hear more options for Friday?"

*No Availability*:
> "I'm sorry, I don't see any available slots for a Routine Cleaning on Tuesday, December 10th. Would you like me to check for a different type of appointment on that day, or perhaps look for Routine Cleaning on another date?"

**Static Messages**:
- Start: "Let me check our availability for you..."
- Success: "The availability check is complete." *(fallback)*
- Fail: "I'm having trouble checking our schedule right now."

### 3. Financial Tools

#### `check_insurance_participation` - Insurance Verification
**Purpose**: Verify if practice accepts patient's dental insurance

**Input Schema**:
```typescript
{
  insuranceProviderName: string // e.g., "Cigna", "Healthplex"
}
```

**Key Features**:
- Partial string matching for insurance name variations
- In-network vs out-of-network determination
- Fallback handling for unconfigured practices
- Cost discussion suggestions

**Success Message Examples**:
*In-Network*:
> "Great news! We are in-network with Cigna. We can proceed with scheduling if you're ready. What type of appointment were you thinking of?"

*Out-of-Network*:
> "Based on the information I have, we might be out-of-network with Healthplex. You are still welcome to be seen here, but you would be responsible for the cost of the visit out-of-pocket. Would you like an estimate for the service you're considering, or would you like to discuss scheduling options?"

*No Configuration*:
> "This practice hasn't specified which insurances they accept in my system. It would be best to confirm directly with the office staff regarding your Cigna plan. Would you like to proceed with scheduling for now, and we can clarify the insurance later?"

**Static Messages**:
- Start: "Let me check that insurance for you..."
- Success: "The insurance check is complete." *(fallback)*
- Fail: "I had a little trouble checking the insurance. Please bear with me."

---

#### `get_service_cost_estimate` - Cost Information
**Purpose**: Provide cost estimates for dental services

**Input Schema**:
```typescript
{
  serviceDescription: string // Description of requested service
}
```

**Key Features**:
- Searches practice's configured cost estimates
- Flexible matching for service descriptions
- Fallback to general cost discussion when specific estimates unavailable

**Static Messages**:
- Start: "Let me check on that cost estimate for you..."
- Success: "The cost estimate check is complete." *(fallback)*
- Fail: "I'm unable to retrieve cost estimates right now."

### 4. Booking & Information Tools

#### `book_appointment` - Appointment Booking
**Purpose**: Complete appointment booking in NexHealth

**Input Schema**:
```typescript
{
  patientId: string,
  appointmentTypeId: string,
  requestedDate: string, // YYYY-MM-DD
  selectedTime: string   // "9:00 AM" format
}
```

**Key Features**:
- **AI-Generated Appointment Notes**: Uses call transcript summary (Phase 1.2)
- Comprehensive validation (patient ID, time format, etc.)
- Provider and operatory assignment logic
- Timezone conversion (practice timezone → UTC)
- Enhanced error handling for booking failures
- Call log updates with booking information

**AI Note Generation Process**:
1. Extract call transcript from VAPI payload
2. Generate summary using GPT-4o via Vercel AI SDK
3. Include summary in appointment note: `"[AI Summary] (Booked via LAINE AI)"`
4. Fallback to generic note if AI generation fails

**Success Message Example**:
> "Excellent! I've successfully booked your Routine Cleaning for Tuesday, December 10th at 9:00 AM with Dr. Johnson. You'll receive a confirmation text shortly. Is there anything else I can help you with today?"

**Error Message Examples**:
*Patient Not Found*:
> "I couldn't find your patient record in our system. Let me help you create a patient record first."

*Time Conflict*:
> "It looks like that time slot just became unavailable. Would you like me to show you other available times?"

**Static Messages**:
- Start: "Perfect! Let me book that appointment for you..."
- Success: "The appointment booking is complete." *(fallback)*
- Fail: "I'm having trouble booking that time. Let me see what else is available."

---

#### `get_practice_details` - Practice Information
**Purpose**: Retrieve practice address and location details

**Input Schema**:
```typescript
{} // No input required
```

**Key Features**:
- Simple address retrieval
- Fallback messaging for unconfigured practices
- Follow-up question prompts

**Success Message Example**:
> "Our practice is located at 123 Main Street, Royal Oak, MI 48067. Is there anything else about our location you'd like to know?"

**Error Message Example**:
> "I don't have the specific address details readily available in my system right now. However, our office team can certainly provide that to you. Were you looking to schedule an appointment?"

**Static Messages**:
- Start: "Let me get those practice details for you..."
- Success: "The practice details lookup is complete." *(fallback)*
- Fail: "I couldn't retrieve the practice details at the moment."

## Integration Features

### Call Log Tracking
- Real-time call status updates
- Patient ID association
- Appointment booking confirmation
- Tool execution history

### Tool Execution Logging
All tool executions are logged to `ToolLog` table:
```typescript
{
  practiceId: string,
  vapiCallId: string,
  toolName: string,
  toolCallId: string,
  arguments: string,     // JSON
  result: string,        // JSON
  success: boolean,
  error?: string,
  executionTimeMs: number
}
```

### Error Code System
Standardized error codes across tools:
- `PATIENT_NOT_FOUND` - Patient lookup failed
- `MISSING_FIRST_NAME` - Required field validation
- `INVALID_DATE_OF_BIRTH` - Format validation
- `NO_ACTIVE_PROVIDERS` - Configuration issue
- `BOOKING_FAILED` - Appointment booking error
- `INSURANCE_CONFIG_MISSING` - Practice setup incomplete
- And many more...

## Current Capabilities

### Supported Workflows
1. **Complete Patient Onboarding**: Find existing → Create new → Verify insurance
2. **Appointment Scheduling**: Find type → Check availability → Book appointment
3. **Practice Information**: Address, costs, insurance participation
4. **Call Documentation**: AI-generated appointment notes with full context

### Integration Status
- ✅ **NexHealth EHR**: Full CRUD operations
- ✅ **VAPI Voice AI**: Dynamic conversations with 8 tools  
- ✅ **Vercel AI SDK**: GPT-4o appointment summarization
- ✅ **Webhook System**: Real-time data synchronization
- ✅ **Practice Management**: Multi-practice support

### Recent Enhancements

#### Phase 1.3 (December 2024)
- Implemented dynamic spoken responses for `get_practice_details`
- Eliminated generic intermediate messages

#### Phase 1.4 (December 2024) 
- **Universal Dynamic Messages**: Extended dynamic responses to all 8 tools
- **Improved UX**: Natural, immediate responses without "Okay" acknowledgments
- **Simplified Fallbacks**: Static messages now serve as ultimate fallbacks only

## Technical Implementation Notes

### Transcript Processing
The system handles multiple transcript formats from VAPI:
- Direct transcript strings
- Message arrays with role/content structure  
- Fallback construction from conversation history

### Provider/Operatory Logic
- Uses practice's saved provider/operatory preferences
- Automatic assignment for single-option scenarios
- Error handling for unconfigured practices

### Timezone Handling
- Practice-aware timezone conversion
- Central Time (America/Chicago) default
- UTC storage for NexHealth API compatibility

### Voice Optimization
- Limited initial option presentation (3-4 choices)
- Conversational follow-up questions
- Natural language error explanations

This tool call system represents a sophisticated integration between voice AI, practice management systems, and patient experience optimization, enabling natural language interactions for complex healthcare scheduling workflows. 