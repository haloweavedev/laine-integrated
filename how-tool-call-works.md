# How Tool Calling Works - Technical Documentation

## Overview

This document explains the complete tool calling framework used in this VAPI-integrated dental practice application. The framework enables AI assistants to execute specific functions (tools) and return intelligent responses to phone conversations.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   VAPI Platform │    │  Your Application  │    │   External APIs     │
│                 │    │                    │    │  (NexHealth, etc)   │
│   ┌─────────────┤    │  ┌───────────────┐ │    │                     │
│   │ Assistant   │◄──►│  │ Tool Handler  │ │◄──►│  Database           │
│   │             │    │  │ /api/vapi/    │ │    │  AI Services        │
│   └─────────────┤    │  │ tool-calls    │ │    │                     │
│                 │    │  └───────────────┘ │    │                     │
└─────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## Tool Definition Structure

### 1. Tool Definition Files

Tools are defined in `lib/tools/definitions/` and follow a specific TypeScript interface:

```typescript
// Example: lib/tools/definitions/findAppointmentTypeTool.ts
import type { VapiTool } from '@/types/vapi';

export function getFindAppointmentTypeTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "findAppointmentType",
      description: "Identifies the most suitable dental appointment type based on the patient's stated needs...",
      parameters: {
        type: "object" as const,
        properties: {
          patientRequest: {
            type: "string" as const,
            description: "The patient's verbatim description of their reason for calling..."
          }
        },
        required: ["patientRequest"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi/tool-calls`,
    }
  };
}
```

### 2. Key Components

- **Function Name**: Unique identifier for the tool (e.g., `findAppointmentType`)
- **Description**: Clear description for the AI to understand when and how to use the tool
- **Parameters**: TypeScript-like schema defining required and optional parameters
- **Server URL**: Points back to your application's tool handler endpoint

## Tool Registration Process

### 1. Adding Tools to the Registry

Tools are aggregated in `lib/tools/index.ts`:

```typescript
import { getFindAppointmentTypeTool } from './definitions/findAppointmentTypeTool';
import { getCheckAvailableSlotsTool } from './definitions/checkAvailableSlotsTool';

export function getAllTools(appBaseUrl: string): VapiTool[] {
  const tools: VapiTool[] = [
    getFindAppointmentTypeTool(appBaseUrl),
    getCheckAvailableSlotsTool(appBaseUrl),
    // Add your new tools here
  ];
  return tools;
}
```

### 2. Updating VAPI Assistant

Tools are pushed to VAPI assistants via the `updateVapiAssistant` function:

```typescript
// From lib/vapi.ts
export async function updateVapiAssistant(assistantId: string, payload: VapiUpdatePayload): Promise<void> {
  await vapiRequest(`/assistant/${assistantId}`, "PATCH", payload);
}

// Usage in app/api/laine-config/update/route.ts
const tools = getAllTools(appBaseUrl);
const updateConfig: VapiUpdatePayload = {
  model: {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [{ role: "system", content: systemPrompt }],
    tools  // <-- Tools are included here
  },
  voice: { provider: voiceProvider, voiceId: voiceId },
  firstMessage: firstMessage
};

await updateVapiAssistant(assistantId, updateConfig);
```

## Tool Execution Flow

### 1. VAPI Tool Call Webhook

When a VAPI assistant decides to use a tool, it sends a POST request to `/api/vapi/tool-calls`:

```typescript
// Webhook payload structure
interface ServerMessageToolCallsPayload {
  message: {
    type: "tool-calls";
    toolCallList: ServerMessageToolCallItem[];
    call: {
      id: string;
      orgId?: string;
    };
  };
}

interface ServerMessageToolCallItem {
  id: string;  // VAPI's unique tool call ID
  type: "function";
  function: {
    name: string;  // Tool function name
    arguments: Record<string, any> | string;  // Tool parameters
  };
}
```

### 2. Tool Handler Processing

The tool handler (`app/api/vapi/tool-calls/route.ts`) processes the request:

```typescript
export async function POST(request: NextRequest) {
  // 1. Parse the webhook payload
  const body: ServerMessageToolCallsPayload = await request.json();
  
  // 2. Extract tool information
  const toolCallItem = body.message.toolCallList?.[0];
  const toolName = toolCallItem.function.name;
  const toolArguments = toolCallItem.function.arguments;
  const toolId = toolCallItem.id;
  const callId = body.message.call.id;
  
  // 3. Process based on tool name
  switch (toolName) {
    case "findAppointmentType":
      // Tool-specific logic here
      break;
    case "checkAvailableSlots":
      // Tool-specific logic here
      break;
    // Add your tool cases here
  }
  
  // 4. Return structured response
  return NextResponse.json({
    results: [{
      toolCallId: toolId,
      result: "Success response"  // or error: "Error message"
    }]
  });
}
```

### 3. Response Format

Tools must return responses in VAPI's expected format:

```typescript
interface VapiToolResult {
  toolCallId: string;  // Must match the incoming tool call ID
  result?: string;     // Success response
  error?: string;      // Error message (mutually exclusive with result)
}
```

## Advanced Features

### 1. Conversation State Management

Tools can maintain state between calls using a conversation state pattern:

```typescript
interface ConversationState {
  lastAppointmentTypeId: string;
  lastAppointmentTypeName: string;
  lastAppointmentDuration: number;
  practiceId?: string;
  // ... other state fields
}

// In your tool response
const conversationState: ConversationState = {
  lastAppointmentTypeId: matchedAppointment.nexhealthAppointmentTypeId,
  lastAppointmentTypeName: matchedAppointment.name,
  lastAppointmentDuration: matchedAppointment.duration,
  practiceId: practiceId
};

toolResponse = {
  toolCallId: toolId,
  result: JSON.stringify({
    tool_output_data: {
      messageForAssistant: generatedMessage
    },
    current_conversation_state_snapshot: JSON.stringify(conversationState)
  })
};
```

### 2. AI-Enhanced Responses

Tools can use AI to generate natural responses:

```typescript
// Example from lib/ai/appointmentMatcher.ts
export async function generateAppointmentConfirmationMessage(
  patientQuery: string,
  matchedAppointmentName: string,
  matchedAppointmentDuration: number
): Promise<string> {
  const messages: CoreMessage[] = [
    {
      role: "system",
      content: `You are Laine, a friendly AI assistant for a dental office...`
    },
    {
      role: "user", 
      content: `Patient's request: "${patientQuery}"
                Identified appointment: "${matchedAppointmentName}", ${matchedAppointmentDuration} minutes.
                Craft the spoken response for Laine:`
    }
  ];

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    messages,
    temperature: 0.7
  });

  return text.trim().replace(/\n/g, " ");
}
```

### 3. Database Logging

All tool calls are automatically logged for debugging and monitoring:

```typescript
// ToolLog model tracks:
// - Tool name and arguments
// - Execution success/failure
// - Response times
// - Associated call and practice IDs

// CallLog model tracks:
// - Call status and conversation state
// - Detected intents and outcomes
// - Tool usage within calls
```

## Creating a New Tool

### Step 1: Define the Tool

Create a new file in `lib/tools/definitions/`:

```typescript
// lib/tools/definitions/yourNewTool.ts
import type { VapiTool } from '@/types/vapi';

export function getYourNewTool(appBaseUrl: string): VapiTool {
  return {
    type: "function" as const,
    function: {
      name: "yourNewTool",
      description: "Clear description of what this tool does and when to use it",
      parameters: {
        type: "object" as const,
        properties: {
          requiredParam: {
            type: "string" as const,
            description: "Description of this parameter"
          },
          optionalParam: {
            type: "string" as const, 
            description: "Description of optional parameter"
          }
        },
        required: ["requiredParam"]
      }
    },
    server: {
      url: `${appBaseUrl}/api/vapi/tool-calls`,
    }
  };
}
```

### Step 2: Register the Tool

Add it to `lib/tools/index.ts`:

```typescript
import { getYourNewTool } from './definitions/yourNewTool';

export function getAllTools(appBaseUrl: string): VapiTool[] {
  const tools: VapiTool[] = [
    getFindAppointmentTypeTool(appBaseUrl),
    getCheckAvailableSlotsTool(appBaseUrl),
    getYourNewTool(appBaseUrl),  // <-- Add here
  ];
  return tools;
}
```

### Step 3: Implement Tool Logic

Add a case in `app/api/vapi/tool-calls/route.ts`:

```typescript
switch (toolName) {
  // ... existing cases
  
  case "yourNewTool": {
    const requiredParam = (typeof toolArguments === 'object' && toolArguments !== null) 
      ? toolArguments.requiredParam as string : undefined;
    const optionalParam = (typeof toolArguments === 'object' && toolArguments !== null) 
      ? toolArguments.optionalParam as string : undefined;
    
    try {
      // Validate required parameters
      if (!requiredParam) {
        toolResponse = {
          toolCallId: toolId!,
          error: "Missing required parameter: requiredParam"
        };
        break;
      }
      
      // Implement your tool logic here
      const result = await processYourTool(requiredParam, optionalParam);
      
      toolResponse = {
        toolCallId: toolId!,
        result: JSON.stringify({
          tool_output_data: {
            messageForAssistant: result.message
          }
        })
      };
      
    } catch (error) {
      console.error(`[VAPI Tool Handler] Error in yourNewTool:`, error);
      toolResponse = {
        toolCallId: toolId!,
        error: "Tool execution failed"
      };
    }
    break;
  }
}
```

### Step 4: Update Assistant

After deploying your changes, update the VAPI assistant to include the new tool by calling the update endpoint or using the admin interface.

## Database Schema

### Key Models

- **Practice**: Links Clerk users to practice configurations
- **PracticeAssistantConfig**: Stores VAPI assistant ID and customization settings  
- **CallLog**: Tracks VAPI calls and conversation outcomes
- **ToolLog**: Logs individual tool executions for debugging
- **AppointmentType**: Dental appointment types with AI matching keywords
- **Provider**: Staff members who can be assigned to appointments

## Environment Variables

Required environment variables:

```bash
# VAPI Configuration
VAPI_API_KEY=your_vapi_api_key

# Application URL (for tool server URLs)
NEXT_PUBLIC_APP_URL=https://your-app.com

# AI Services
OPENAI_API_KEY=your_openai_api_key

# Database
DATABASE_URL=your_postgresql_connection_string
```

## Testing Tools

### 1. Use the Test Script

```bash
node scripts/test-tool-call.js
```

### 2. Manual Testing Payload

```json
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "test-call-id-12345",
      "assistantId": "your-assistant-id"
    },
    "assistant": {
      "id": "your-assistant-id",
      "name": "Your Practice - Laine"
    },
    "toolCallList": [
      {
        "id": "test-tool-call-1",
        "type": "function",
        "function": {
          "name": "yourNewTool",
          "arguments": {
            "requiredParam": "test value"
          }
        }
      }
    ]
  }
}
```

## Best Practices

### 1. Tool Design
- Keep tool functions focused and single-purpose
- Use clear, descriptive parameter names and descriptions
- Validate all input parameters thoroughly
- Handle errors gracefully and return helpful error messages

### 2. Response Generation
- Use AI to generate natural, conversational responses
- Maintain conversation context through state management
- Keep responses concise but informative
- Test responses with actual phone conversations

### 3. Performance
- Log tool execution times for monitoring
- Implement timeout handling for external API calls
- Use database transactions for data consistency
- Cache frequently accessed data when appropriate

### 4. Security
- Validate all webhook requests (when VAPI supports signing)
- Sanitize user inputs to prevent injection attacks
- Use environment variables for sensitive configuration
- Log security-relevant events for monitoring

## Troubleshooting

### Common Issues

1. **Tool not appearing in VAPI**: Ensure the assistant was updated after adding the tool
2. **Tool call failures**: Check logs in `/api/vapi/tool-calls` and database ToolLog table
3. **Parameter parsing errors**: Verify the tool definition matches the actual usage
4. **Database connection issues**: Check environment variables and connection pooling

### Debugging

- Use the tool call logs page: `/tool-call-log`
- Check the database ToolLog and CallLog tables
- Enable debug logging in the tool handler
- Test tools individually using the test script

## Security Considerations

- All tool calls are logged for audit purposes
- Input validation prevents malicious parameter injection
- Database queries use parameterized statements
- External API calls include proper error handling
- Sensitive data is not logged in plain text

---

This framework provides a robust foundation for creating intelligent phone assistants that can execute complex business logic while maintaining conversation context and providing natural responses to patients. 