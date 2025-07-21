#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const API_BASE_URL = 'https://api.vapi.ai';

// --- CONFIGURATION ---
// This name will be used for the VAPI Assistant.
const PRACTICE_NAME = "Royal Oak Dental"; 
// --------------------

const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi-webhook`
  : null;

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
  if (!VAPI_API_KEY || !process.env.NEXHEALTH_API_KEY || !WEBHOOK_URL) {
    console.error('❌ Missing required environment variables: VAPI_API_KEY, NEXHEALTH_API_KEY, or NEXT_PUBLIC_URL.');
    return;
  }
  
  console.log(`🚀 Starting Laine Assistant provisioning for: "${PRACTICE_NAME}"...`);
  console.log(`Webhook URL is set to: ${WEBHOOK_URL}`);

  try {
    // 1. Create the Custom Tool for Patient Registration
    console.log("\n[1/2] Creating the 'create_patient_record' tool...");
    const toolConfig = {
      type: "function",
      async: false,
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
      server: { url: WEBHOOK_URL, timeoutSeconds: 25 },
    };
    const createdTool = await apiRequest('/tool', 'POST', toolConfig);
    console.log(`✅ Tool created successfully. Tool ID: ${createdTool.id}`);

    // 2. Create the Assistant and link the Tool
    console.log("\n[2/2] Creating the main Laine Assistant...");

    const systemPrompt = `You are Laine, a friendly, professional, and highly efficient AI receptionist for ${PRACTICE_NAME}. Your primary function is to help new and existing patients.

    **New Patient Registration Flow:**
    If a caller indicates they are a new patient, you MUST follow this exact sequence to register them:
    1.  **Collect Full Name:** Ask for their first and last name and ask them to spell it out to ensure accuracy.
    2.  **Collect Date of Birth:** Ask for their date of birth, including the year. After they provide it, repeat it back to them for confirmation (e.g., "Okay, just to confirm, that was October 12th, 1994?").
    3.  **Collect Phone Number:** Ask for their 10-digit phone number. Repeat it back for confirmation.
    4.  **Collect Email:** Ask for their email address and ask them to spell it out.
    5.  **Execute Tool:** Once you have ALL four pieces of information (Name, DOB, Phone, Email), and ONLY then, you MUST call the \`create_patient_record\` tool to save their details.
    
    **General Rules:**
    - Be polite and conversational.
    - If you are unsure about any information, ask for clarification.
    - Do not make up information. If you don't know something, say you don't have access to that information.`;

    const assistantConfig = {
      name: `Laine - ${PRACTICE_NAME}`,
      firstMessage: `Thank you for calling ${PRACTICE_NAME}. This is Laine, how can I help you today?`,
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }],
        toolIds: [createdTool.id]
      },
      voice: {
        provider: "vapi",
        voiceId: "Elliot"
      },
      serverMessages: ["end-of-call-report", "status-update", "tool-calls"],
    };
    
    const createdAssistant = await apiRequest('/assistant', 'POST', assistantConfig);
    console.log(`✅ Assistant created successfully.`);

    // Final Summary
    console.log("\n\n🎉 --- Laine Assistant Provisioning Complete --- 🎉");
    console.log("The following resources have been created and linked in your VAPI account:");
    console.log(`\n- Tool: 'create_patient_record' (ID: ${createdTool.id})`);
    console.log(`- Assistant: '${createdAssistant.name}' (ID: ${createdAssistant.id})`);
    
    console.log(`\nTo Test:`);
    console.log(`1. Go to your VAPI Dashboard -> Phone Numbers.`);
    console.log(`2. Create a new Phone Number or edit an existing one.`);
    console.log(`3. In its 'Inbound Settings', select the assistant named "${createdAssistant.name}".`);
    console.log(`4. Call the phone number.`);
    console.log(`5. When the assistant answers, say: "Hi, I'm a new patient and need to get set up."`);
    console.log("6. Follow the prompts. Check your Next.js server logs to see the webhook being called and the real NexHealth API request being made.");
    
  } catch (error) {
    console.error("\n❌ An error occurred during the setup script:", error);
  }
}

main(); 