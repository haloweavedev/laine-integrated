#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = 'https://api.vapi.ai';

// Define tools directly to avoid TypeScript import issues
function getAllTools(appBaseUrl) {
  return [
    {
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
      server: {
        url: `${appBaseUrl}/api/vapi/tool-calls`,
      }
    },
    {
      type: "function",
      function: {
        name: "managePatientRecord",
        description: "Handles everything related to identifying an existing patient or creating a new patient record. Call this tool after the appointment type is known. Pass any information the user provides.",
        parameters: {
          type: "object",
          properties: {
            fullName: {
              type: "string",
              description: "The patient's full name (first and last) if provided"
            },
            dateOfBirth: {
              type: "string",
              description: "The patient's date of birth if provided"
            },
            phoneNumber: {
              type: "string",
              description: "The patient's phone number if provided"
            },
            emailAddress: {
              type: "string",
              description: "The patient's email address if provided"
            }
          },
          required: []
        }
      },
      server: {
        url: `${appBaseUrl}/api/vapi/tool-calls`,
      }
    },
    {
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
      server: {
        url: `${appBaseUrl}/api/vapi/tool-calls`,
      }
    },
    {
      type: "function",
      function: {
        name: "confirmBooking",
        description: "Confirms and books the selected appointment slot after the patient has chosen a specific time. Call this when the user has confirmed their preferred appointment time.",
        parameters: {
          type: "object",
          properties: {
            userSelection: {
              type: "string",
              description: "The user's selection of the appointment time they want to book, exactly as they stated it."
            }
          },
          required: ["userSelection"]
        }
      },
      server: {
        url: `${appBaseUrl}/api/vapi/tool-calls`,
      }
    }
  ];
}

async function getAllAssistants() {
  console.log('Fetching all assistants from VAPI...');
  try {
    const response = await fetch(`${VAPI_BASE_URL}/assistant`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch assistants. Status: ${response.status}, Body: ${errorText}`);
    }
    
    const assistants = await response.json();
    console.log(`Found ${assistants.length} total assistants in the organization.`);
    return assistants;
  } catch (error) {
    console.error('Error fetching assistants:', error.message);
    return [];
  }
}

async function updateAssistantTools(assistantId, assistantName) {
  console.log(`- Updating assistant: "${assistantName}" (ID: ${assistantId})`);
  try {
    // Get current assistant configuration
    const currentResponse = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!currentResponse.ok) {
      throw new Error(`Failed to fetch current assistant. Status: ${currentResponse.status}`);
    }

    const currentAssistant = await currentResponse.json();
    
    // Get our tools with empty messages arrays to disable filler
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const tools = getAllTools(appBaseUrl);
    
    // Set empty messages array for each tool to disable filler
    const toolsWithNoFiller = tools.map(tool => ({
      ...tool,
      messages: [] // This disables all filler messages
    }));

    // Update the assistant with tools that have no filler messages
    const updatePayload = {
      model: {
        ...currentAssistant.model,
        tools: toolsWithNoFiller
      }
    };

    const updateResponse = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateResponse.ok) {
      const errorBody = await updateResponse.text();
      throw new Error(`Failed to update assistant "${assistantName}". Status: ${updateResponse.status}, Body: ${errorBody}`);
    }
    
    const updatedAssistant = await updateResponse.json();
    console.log(`  ✅ Successfully updated assistant: "${assistantName}"`);
    console.log(`     Tools configured with empty messages arrays to disable filler`);
    console.log(`     Updated ${updatedAssistant.model?.tools?.length || 0} tools`);
  } catch (error) {
    console.error(`  ❌ Error updating assistant "${assistantName}":`, error.message);
  }
}

async function main() {
  if (!VAPI_API_KEY) {
    console.error("❌ VAPI_API_KEY environment variable not set. Please check your .env file.");
    return;
  }

  console.log('🔧 VAPI Assistant Tools Configuration Script');
  console.log('============================================\n');

  // Get practice assistant configurations from our database
  const practiceConfigs = await prisma.practiceAssistantConfig.findMany({
    include: { practice: true }
  });

  if (practiceConfigs.length === 0) {
    console.warn("⚠️  No practice assistant configurations found in database.");
    return;
  }

  console.log(`Found ${practiceConfigs.length} practice assistant configurations in database.`);
  
  // Get all VAPI assistants
  const allAssistants = await getAllAssistants();
  if (allAssistants.length === 0) {
    console.log("No assistants found to configure.");
    return;
  }

  // Update each practice's assistant
  for (const config of practiceConfigs) {
    const assistantId = config.vapiAssistantId;
    const practiceName = config.practice.name || 'Unknown Practice';
    
    if (!assistantId) {
      console.warn(`⚠️  No VAPI assistant ID found for practice: ${practiceName}`);
      continue;
    }
    
    // Find the assistant in VAPI
    const assistant = allAssistants.find(a => a.id === assistantId);
    if (!assistant) {
      console.warn(`⚠️  Assistant with ID ${assistantId} not found in VAPI for practice: ${practiceName}`);
      continue;
    }
    
    console.log(`\nConfiguring assistant for practice: ${practiceName}`);
    await updateAssistantTools(assistantId, assistant.name);
  }

  console.log('\n🎉 Assistant configuration script finished.');
  console.log('All Laine assistants have been configured with tools that have no filler messages.');
  console.log('You can now test with a live call to verify the "This will just take a sec" message is gone.');
  
  await prisma.$disconnect();
}

main().catch(console.error); 