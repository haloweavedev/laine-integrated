#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const API_BASE_URL = 'https://api.vapi.ai';
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL;

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
  
  console.log(`🚀 Updating VAPI Assistant configuration...`);
  console.log(`App Base URL: ${APP_BASE_URL}`);

  try {
    // 1. List all assistants to find the one we want to update
    console.log("\n[1/4] Finding existing Laine Assistant...");
    const assistants = await apiRequest('/assistant', 'GET');
    const laineAssistant = assistants.find(assistant => 
      assistant.name && assistant.name.includes('Laine')
    );

    if (!laineAssistant) {
      console.error('❌ No Laine assistant found. Please create one first using create-laine-assistant.js');
      return;
    }

    console.log(`✅ Found assistant: "${laineAssistant.name}" (ID: ${laineAssistant.id})`);

    // 2. Create/Update tools
    console.log("\n[2/4] Creating/updating tools...");
    
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
        console.log(`✅ Created/updated tool: ${toolDef.function.name} (ID: ${createdTool.id})`);
      } catch (error) {
        console.error(`❌ Error creating tool ${toolDef.function.name}:`, error.message);
        return;
      }
    }

    // 3. Update the assistant's system prompt
    console.log("\n[3/4] Updating system prompt...");
    
    const systemPrompt = `You are Laine, a friendly, professional, and highly efficient AI receptionist for the dental practice. Your primary function is to help new and existing patients.

**New Patient Registration Flow:**
If a caller indicates they are a new patient, you MUST follow this exact sequence to register them:
1.  **Collect Full Name:** Ask for their first and last name and ask them to spell it out to ensure accuracy.
2.  **Collect Date of Birth:** Ask for their date of birth, including the year. After they provide it, repeat it back to them for confirmation (e.g., "Okay, just to confirm, that was October 12th, 1994?").
3.  **Collect Phone Number:** Ask for their 10-digit phone number. Repeat it back for confirmation.
4.  **Collect Email:** Ask for their email address and ask them to spell it out.
5.  **Execute Tool:** Once you have ALL four pieces of information (Name, DOB, Phone, Email), and ONLY then, you MUST call the \`create_patient_record\` tool to save their details.

**Available Tools:**
- \`findAppointmentType\`: Always call this first to understand the patient's need
- \`create_patient_record\`: Use only for new patients after collecting all required information
- \`checkAvailableSlots\`: Find available appointment times
- \`confirmBooking\`: Final step to book the appointment

**General Rules:**
- Be polite and conversational.
- If you are unsure about any information, ask for clarification.
- Do not make up information. If you don't know something, say you don't have access to that information.`;

    // 4. Update the assistant with new tools and prompt
    console.log("\n[4/4] Updating assistant configuration...");
    
    const updatePayload = {
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }],
        toolIds: toolIds
      },
      voice: {
        provider: "vapi",
        voiceId: "Elliot"
      },
      serverMessages: ["end-of-call-report", "status-update", "tool-calls"],
    };

    const updatedAssistant = await apiRequest(`/assistant/${laineAssistant.id}`, 'PATCH', updatePayload);
    console.log(`✅ Assistant updated successfully.`);

    // Final Summary
    console.log("\n\n🎉 --- VAPI Assistant Update Complete --- 🎉");
    console.log("The following changes have been made:");
    console.log(`\n✅ Replaced managePatientRecord with create_patient_record`);
    console.log(`✅ Updated webhook URL to ${APP_BASE_URL}/api/vapi-webhook`);
    console.log(`✅ Updated system prompt with new patient registration flow`);
    console.log(`✅ Updated all tool configurations`);
    
    console.log(`\nTool IDs now configured:`);
    toolDefinitions.forEach((tool, index) => {
      console.log(`- ${tool.function.name}: ${toolIds[index]}`);
    });
    
    console.log(`\nTo Test:`);
    console.log(`1. Call your VAPI phone number`);
    console.log(`2. Say: "Hi, I'm a new patient and need to get set up"`);
    console.log(`3. Follow the prompts and provide all required information`);
    console.log(`4. Check your Next.js server logs to see the new webhook being called`);
    
  } catch (error) {
    console.error("\n❌ An error occurred during the update:", error);
  }
}

main(); 