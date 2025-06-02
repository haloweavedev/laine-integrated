import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { fetchNexhealthAPI } from "@/lib/nexhealth";

// Helper for current date context
function getCurrentDateContext(): string {
  const today = new Date();
  return `Today is ${today.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  })}`;
}

export const createNewPatientSchema = z.object({
  firstName: z.string()
    .min(1)
    .describe(`
Extract the patient's first name from their response.

IMPORTANT: If the patient spells their name letter by letter (e.g., "B-O-B"), convert it to the proper name (e.g., "Bob").

EXAMPLES:
- "My first name is Sarah" → "Sarah"
- "V-A-P-I" → "Vapi"
- "It's Michael, M-I-C-H-A-E-L" → "Michael"
    `),
  lastName: z.string()
    .min(1)
    .describe(`
Extract the patient's last name from their response.

IMPORTANT: If the patient spells their name letter by letter (e.g., "T-E-S-T"), convert it to the proper name (e.g., "Test").

EXAMPLES:
- "Last name is Johnson" → "Johnson"
- "Smith, S-M-I-T-H" → "Smith"
- "It's Rodriguez with a Z" → "Rodriguez"
    `),
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .describe(`
Convert the patient's date of birth to YYYY-MM-DD format.

${getCurrentDateContext()}

EXAMPLES:
- "January 20, 1990" → "1990-01-20"
- "January twentieth nineteen ninety" → "1990-01-20"
- "1/20/90" → "1990-01-20"
- "01-20-1990" → "1990-01-20"

IMPORTANT:
- For 2-digit years, assume 1900s for 50-99, and 2000s for 00-49
- Always return in YYYY-MM-DD format
    `),
  phone: z.string()
    .min(10)
    .describe(`
Extract and format the patient's phone number as just digits.

EXAMPLES:
- "313-555-1200" → "3135551200"
- "three one three, five five five, one two zero zero" → "3135551200"
- "(313) 555-1200" → "3135551200"
- "My number is 313 555 1200" → "3135551200"

IMPORTANT: Return only digits, no formatting characters.
    `),
  email: z.string()
    .email()
    .describe(`
Extract the patient's email address.

EXAMPLES:
- "My email is john at gmail dot com" → "john@gmail.com"
- "sarah.smith@example.com" → "sarah.smith@example.com"
- "It's mike underscore jones at yahoo dot com" → "mike_jones@yahoo.com"

IMPORTANT: Convert spoken email format to proper email syntax.
    `)
});

const createNewPatientTool: ToolDefinition<typeof createNewPatientSchema> = {
  name: "create_new_patient",
  description: "Creates a new patient record in the practice's EHR system. Use this when a caller indicates they are a new patient.",
  schema: createNewPatientSchema,
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice, vapiCallId } = context;
    
    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return {
        success: false,
        error_code: "PRACTICE_CONFIG_MISSING",
        message_to_patient: "I'm sorry, I can't create new patient records right now. Please contact the office directly to register as a new patient."
      };
    }

    if (!practice.savedProviders || practice.savedProviders.length === 0) {
      return {
        success: false,
        error_code: "NO_SAVED_PROVIDERS",
        message_to_patient: "I need to assign you to a provider but none are configured. Please contact the office to complete your registration."
      };
    }

    try {
      // Get the first active provider for new patient assignment
      const activeProvider = practice.savedProviders.find(sp => sp.isActive);
      if (!activeProvider) {
        return {
          success: false,
          error_code: "NO_ACTIVE_PROVIDERS",
          message_to_patient: "I need to assign you to a provider but none are available. Please contact the office to complete your registration."
        };
      }

      // Format phone for display
      const formattedPhone = args.phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
      
      // Prepare new patient data matching NexHealth API structure
      const newPatientData = {
        provider: { 
          provider_id: parseInt(activeProvider.provider.nexhealthProviderId) 
        },
        patient: {
          first_name: args.firstName,
          last_name: args.lastName,
          email: args.email,
          bio: {
            date_of_birth: args.dateOfBirth,
            phone_number: args.phone,
            gender: "Prefer not to say" // Default, can be enhanced to collect this
          }
        }
      };

      console.log(`[createNewPatient] Creating patient: ${args.firstName} ${args.lastName}`);

      const createResponse = await fetchNexhealthAPI(
        '/patients',
        practice.nexhealthSubdomain,
        { location_id: practice.nexhealthLocationId },
        'POST',
        newPatientData
      );

      console.log(`[createNewPatient] Response:`, JSON.stringify(createResponse, null, 2));

      // Extract patient ID from response
      let newPatientId = null;
      if (createResponse?.data?.id) {
        newPatientId = createResponse.data.id;
      } else if (createResponse?.id) {
        newPatientId = createResponse.id;
      } else if (createResponse?.data?.patient?.id) {
        newPatientId = createResponse.data.patient.id;
      }

      if (!newPatientId) {
        console.error(`[createNewPatient] Failed to extract patient ID from response`);
        return {
          success: false,
          error_code: "PATIENT_CREATION_FAILED",
          message_to_patient: "I had trouble creating your patient record. Please contact the office to complete your registration.",
          details: "Could not extract patient ID from response"
        };
      }

      // Update call log with new patient ID
      await updateCallLogWithPatient(vapiCallId, practice.id, String(newPatientId));

      return {
        success: true,
        message_to_patient: `Perfect! I've created your patient record. Welcome to ${practice.name || 'our practice'}, ${args.firstName}! Now, what type of appointment would you like to schedule?`,
        data: {
          patient_id: newPatientId,
          patient_name: `${args.firstName} ${args.lastName}`,
          date_of_birth: args.dateOfBirth,
          phone: formattedPhone,
          email: args.email,
          created: true
        }
      };

    } catch (error) {
      console.error(`[createNewPatient] Error:`, error);
      
      let message = "I'm having trouble creating your patient record right now. Please contact the office directly to register.";
      
      if (error instanceof Error) {
        if (error.message.includes("409") || error.message.includes("duplicate")) {
          message = "It looks like you might already be in our system. Let me search for your existing record instead.";
        } else if (error.message.includes("401")) {
          message = "There's an authentication issue with our system. Please contact the office to register.";
        }
      }
      
      return {
        success: false,
        error_code: "PATIENT_CREATION_ERROR",
        message_to_patient: message,
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me create your patient record...",
    success: "Perfect! I've set up your patient record.",
    fail: "I'm having trouble creating your record. Let me try another way."
  }
};

async function updateCallLogWithPatient(vapiCallId: string, practiceId: string, patientId: string) {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.callLog.upsert({
      where: { vapiCallId },
      create: {
        vapiCallId,
        practiceId,
        callStatus: "TOOL_IN_PROGRESS",
        nexhealthPatientId: patientId,
        callTimestampStart: new Date()
      },
      update: {
        nexhealthPatientId: patientId,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error("[createNewPatient] Error updating call log:", error);
  }
}

export default createNewPatientTool; 