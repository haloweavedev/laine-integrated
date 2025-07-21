#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const API_BASE_URL = 'https://api.vapi.ai';

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
  if (!VAPI_API_KEY) {
    console.error('❌ VAPI_API_KEY is not set in your .env file.');
    console.log('Please add: VAPI_API_KEY=your_vapi_api_key_here');
    return;
  }
  if (!process.env.NEXHEALTH_API_KEY) {
    console.error('❌ NEXHEALTH_API_KEY is not set in your .env file.');
    console.log('Please add: NEXHEALTH_API_KEY=your_nexhealth_api_key_here');
    return;
  }
  if (!WEBHOOK_URL) {
    console.error('❌ NEXT_PUBLIC_URL is not set in your .env file. This is required for the webhook URL.');
    console.log('Please add: NEXT_PUBLIC_URL=https://your-domain.com (or http://localhost:3000 for local testing)');
    return;
  }
  
  console.log("🚀 Starting Laine POC Setup...");
  console.log(`Webhook URL is configured to: ${WEBHOOK_URL}`);

  // 1. Create Tools
  console.log("\n[1/4] Creating VAPI Tools...");
  const createPatientTool = await apiRequest('/tool', 'POST', {
    type: "function",
    async: false,
    function: {
      name: "create_patient_record",
      description: "Creates a new patient record in the EHR system with all the collected information.",
      parameters: {
        type: "object",
        properties: {
          firstName: { type: "string", description: "The patient's first name." },
          lastName: { type: "string", description: "The patient's last name." },
          dateOfBirth: { type: "string", description: "The patient's date of birth. The format must be YYYY-MM-DD." },
          phoneNumber: { type: "string", description: "The patient's 10-digit phone number." },
          email: { type: "string", description: "The patient's email address." },
        },
        required: ["firstName", "lastName", "dateOfBirth", "phoneNumber", "email"],
      },
    },
    server: { url: WEBHOOK_URL },
  });
  
  const signalToolsConfig = [
    { name: "name_collected", description: "Signal that patient's name is collected." },
    { name: "dob_collected", description: "Signal that patient's DOB is collected." },
    { name: "phone_collected", description: "Signal that patient's phone is collected." },
    { name: "email_collected", description: "Signal that patient's email is collected." },
  ];
  
  const createdSignalTools = await Promise.all(
    signalToolsConfig.map(tool => apiRequest('/tool', 'POST', { type: "function", function: tool }))
  );
  
  const toolIds = {
    createPatient: createPatientTool.id,
    nameCollected: createdSignalTools[0].id,
    dobCollected: createdSignalTools[1].id,
    phoneCollected: createdSignalTools[2].id,
    emailCollected: createdSignalTools[3].id,
  };
  console.log("✅ Tools created successfully.");

  // 2. Create Workflow
  console.log("\n[2/4] Creating VAPI Workflow...");
  const workflowConfig = {
    name: "New Patient Registration Flow",
    nodes: [
        { type: "conversation", name: "collect_name", isStart: true, prompt: "I can help you get registered as a new patient. First, what is your full name, and could you please spell it out for me?", variableExtractionPlan: { schema: { type: "object", properties: { firstName: { type: "string" }, lastName: { type: "string" } }, required: ["firstName", "lastName"] } }, toolIds: [toolIds.nameCollected] },
        { type: "conversation", name: "collect_dob", prompt: "Thank you, {{firstName}}. And what is your date of birth, including the year?", variableExtractionPlan: { schema: { type: "object", properties: { dateOfBirth: { type: "string", description: "The patient's date of birth, e.g., 'October 12th 1994'. Convert to YYYY-MM-DD." } }, required: ["dateOfBirth"] } }, toolIds: [toolIds.dobCollected] },
        { type: "conversation", name: "collect_phone", prompt: "Got it, {{dateOfBirth}}. What is the best 10-digit phone number to reach you?", variableExtractionPlan: { schema: { type: "object", properties: { phoneNumber: { type: "string" } }, required: ["phoneNumber"] } }, toolIds: [toolIds.phoneCollected] },
        { type: "conversation", name: "collect_email", prompt: "Perfect, your number is {{phoneNumber}}. Lastly, what is your email address, and could you please spell that out?", variableExtractionPlan: { schema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] } }, toolIds: [toolIds.emailCollected] },
        { type: "tool", name: "create_patient_in_ehr", toolId: toolIds.createPatient }
    ],
    edges: [
        { from: "collect_name", to: "collect_dob" },
        { from: "collect_dob", to: "collect_phone" },
        { from: "collect_phone", to: "collect_email" },
        { from: "collect_email", to: "create_patient_in_ehr" }
    ],
  };
  const createdWorkflow = await apiRequest('/workflow', 'POST', workflowConfig);
  console.log("✅ Workflow created successfully.");

  // 3. Create Workflow Assistant
  console.log("\n[3/4] Creating Workflow Assistant...");
  const workflowAssistantConfig = {
    name: "Laine - New Patient Onboarding",
    model: {
      provider: "openai",
      model: "gpt-4o-mini"
    },
    voice: { provider: "vapi", voiceId: "Elliot" },
  };
  const workflowAssistant = await apiRequest('/assistant', 'POST', workflowAssistantConfig);
  console.log("✅ Workflow Assistant created successfully.");

  // Link the assistant to the workflow
  console.log("🔗 Linking assistant to workflow...");
  try {
    await apiRequest(`/workflow/${createdWorkflow.id}`, 'PATCH', {
      assistantId: workflowAssistant.id
    });
    console.log("✅ Assistant linked to workflow successfully.");
  } catch (error) {
    console.log("⚠️ Could not link assistant to workflow directly. You may need to configure this in the VAPI dashboard.");
    console.log("Workflow ID:", createdWorkflow.id);
    console.log("Assistant ID:", workflowAssistant.id);
  }

  // 4. Create Lobby Assistant
  console.log("\n[4/4] Creating Lobby Assistant...");
  const lobbyAssistantConfig = {
    name: "Laine - Receptionist - POC",
    firstMessage: "Thank you for calling Royal Oak Dental. This is Laine, how can I help you today?",
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "You are Laine, a friendly and helpful receptionist. Your goal is to understand the caller's intent and help them with their dental needs. For new patient registration, gather their information and assist them through the process." }]
    },
    voice: { provider: "vapi", voiceId: "Elliot" },
  };
  const lobbyAssistant = await apiRequest('/assistant', 'POST', lobbyAssistantConfig);
  console.log("✅ Lobby Assistant created successfully.");
  
  // Final Summary
  console.log("\n\n🎉 --- Laine POC Setup Complete --- 🎉");
  console.log("Your resources have been created on VAPI.");
  console.log(`\nYour MAIN assistant to test with is:`);
  console.log(`  - Name: ${lobbyAssistant.name}`);
  console.log(`  - ID: ${lobbyAssistant.id}`);
  
  console.log(`\nWorkflow Assistant for Patient Registration:`);
  console.log(`  - Name: ${workflowAssistant.name}`);
  console.log(`  - ID: ${workflowAssistant.id}`);
  console.log(`  - Workflow ID: ${createdWorkflow.id}`);

  console.log(`\nTo Test:`);
  console.log(`1. Go to your VAPI Dashboard -> Phone Numbers.`);
  console.log(`2. Create a new Phone Number.`);
  console.log(`3. In its 'Inbound Settings', select the assistant named "${lobbyAssistant.name}".`);
  console.log(`4. Call the phone number to test the lobby assistant.`);
  console.log(`\nFor the full workflow:`);
  console.log(`5. You can also test the workflow assistant directly by assigning it to a phone number.`);
  console.log(`6. Call and follow the patient registration flow - it will collect name, DOB, phone, email.`);
  console.log(`7. The final step will create a real patient record in NexHealth via the webhook.`);
  console.log(`\n📝 Note: Transfer functionality between assistants may need manual configuration in the VAPI dashboard.`);
}

main().catch(error => {
  console.error("\n❌ An error occurred during setup:", error);
}); 