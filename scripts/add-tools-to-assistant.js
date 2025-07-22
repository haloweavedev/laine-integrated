#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const API_BASE_URL = 'https://api.vapi.ai';
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL;
const TARGET_ASSISTANT_ID = '6820f09a-806c-4df7-8b41-0010fa9cc8b0';

// Tool definitions inline (following the established pattern)
function getFindAppointmentTypeTool(appBaseUrl) {
  return {
    type: "function",
    function: {
      name: "findAppointmentType",
      description: "Identifies the patient's need (e.g., 'toothache', 'cleaning') and determines the correct appointment type. **This is always the first tool to call in a conversation.**",
      parameters: {
        type: "object",
        properties: {
          patientRequest: {
            type: "string",
            description: "The patient's verbatim description of their reason for calling, their symptoms, or the type of appointment they are requesting. For example, 'I have a toothache', 'I need a cleaning', or 'My crown fell off and I need it re-cemented'."
          }
        },
        required: ["patientRequest"]
      }
    },
    server: { url: `${appBaseUrl}/api/vapi/tool-calls` }
  };
}

function getCreatePatientRecordTool(appBaseUrl) {
  return {
    type: "function",
    function: {
      name: "create_patient_record",
      description: "Creates a new patient record in the dental practice's Electronic Health Record (EHR) system. Use this tool only after collecting the patient's full name, date of birth, phone number, and email address.",
      parameters: {
        type: "object",
        properties: {
          firstName: { type: "string", description: "The patient's first name." },
          lastName: { type: "string", description: "The patient's last name." },
          dateOfBirth: { type: "string", description: "The patient's date of birth in YYYY-MM-DD format." },
          phoneNumber: { type: "string", description: "The patient's 10-digit phone number, without country code or symbols." },
          email: { type: "string", description: "The patient's email address." },
        },
        required: ["firstName", "lastName", "dateOfBirth", "phoneNumber", "email"],
      },
    },
    server: { url: `${appBaseUrl}/api/vapi-webhook`, timeoutSeconds: 25 }
  };
}

function getCheckAvailableSlotsTool(appBaseUrl) {
  return {
    type: "function",
    function: {
      name: "checkAvailableSlots",
      description: "Finds available time *buckets* (e.g., 'Morning', 'Afternoon') for a standard, non-urgent appointment. Call this *after* the appointment type is known and the user has expressed a preference for a day or time.",
      parameters: {
        type: "object",
        properties: {
          preferredDaysOfWeek: {
            type: "string",
            description: "A JSON string array of the user's preferred days of the week. Example: '[\"Monday\", \"Wednesday\"]'. This is collected from the user."
          },
          timeBucket: {
            type: "string",
            description: "The user's general time preference, which must be one of the following values: 'Early', 'Morning', 'Midday', 'Afternoon', 'Evening', 'Late', or 'AllDay'. This is collected from the user."
          },
          requestedDate: {
            type: "string",
            description: "The user's specific requested date, like 'tomorrow', 'next Wednesday', or 'July 10th'. Use this for specific date searches."
          }
        },
        required: []
      }
    },
    server: { url: `${appBaseUrl}/api/vapi/tool-calls` }
  };
}

function getConfirmBookingTool(appBaseUrl) {
  return {
    type: "function",
    function: {
      name: "confirmBooking",
      description: "Books the appointment. Call this **only** after the user has verbally agreed to a *specific time slot* (e.g., 'Yes, 9 AM works'). This is the final action to secure the appointment.",
      parameters: {
        type: "object",
        properties: {
          userSelection: {
            type: "string",
            description: "The user's verbatim selection of the time slot they want. For example, 'the 2 PM one', 'tomorrow at 7:40 AM', or 'yes, that first one works'."
          }
        },
        required: ["userSelection"]
      }
    },
    server: { url: `${appBaseUrl}/api/vapi/tool-calls`, timeoutSeconds: 10 }
  };
}

async function apiRequest(endpoint, method, body) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VAPI API Error on ${endpoint}: ${response.status} ${errorText}`);
  }
  return response.json();
}

async function main() {
  if (!VAPI_API_KEY || !APP_BASE_URL) {
    console.error('❌ Missing required environment variables: VAPI_API_KEY or NEXT_PUBLIC_APP_URL.');
    return;
  }
  
  console.log(`🚀 Adding tools to Assistant: ${TARGET_ASSISTANT_ID}`);
  console.log(`App Base URL: ${APP_BASE_URL}`);

  try {
    // 1. Create all required tools
    console.log("\n[1/2] Creating tools...");
    
    const toolDefinitions = [
      getFindAppointmentTypeTool(APP_BASE_URL),
      getCreatePatientRecordTool(APP_BASE_URL),
      getCheckAvailableSlotsTool(APP_BASE_URL),
      getConfirmBookingTool(APP_BASE_URL)
    ];

    const toolIds = [];
    
    for (const toolDef of toolDefinitions) {
      try {
        const createdTool = await apiRequest('/tool', 'POST', toolDef);
        toolIds.push(createdTool.id);
        console.log(`✅ Created tool: ${toolDef.function.name} (ID: ${createdTool.id})`);
      } catch (error) {
        console.error(`❌ Error creating tool ${toolDef.function.name}:`, error.message);
        return;
      }
    }

    // 2. Update the assistant with the new tools
    console.log("\n[2/2] Adding tools to assistant...");
    
    // Get current assistant configuration
    const currentAssistant = await apiRequest(`/assistant/${TARGET_ASSISTANT_ID}`);
    
    const updatePayload = {
      model: {
        ...currentAssistant.model,
        toolIds: toolIds
      }
    };

    const updatedAssistant = await apiRequest(`/assistant/${TARGET_ASSISTANT_ID}`, 'PATCH', updatePayload);
    console.log(`✅ Assistant updated with ${toolIds.length} tools.`);

    // Final Summary
    console.log("\n\n🎉 --- Tools Successfully Added --- 🎉");
    console.log(`Assistant: ${currentAssistant.name} (${TARGET_ASSISTANT_ID})`);
    console.log(`\nTools now configured:`);
    toolDefinitions.forEach((tool, index) => {
      console.log(`✅ ${tool.function.name}: ${toolIds[index]}`);
    });
    
    console.log(`\n🧪 Ready to Test:`);
    console.log(`1. Call your VAPI phone number`);
    console.log(`2. Say: "Hi, I'm a new patient and need to get set up"`);
    console.log(`3. The assistant now has all required tools and should work properly`);
    
  } catch (error) {
    console.error("\n❌ An error occurred:", error.message);
  }
}

main(); 