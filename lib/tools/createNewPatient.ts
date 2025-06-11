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
    .describe(`Patient's first name. If spelled out (B-O-B), convert to proper form (Bob). Example: "My name is Sarah" → "Sarah"`),
  lastName: z.string()
    .min(1)
    .describe(`Patient's last name. If spelled out (T-E-S-T), convert to proper form (Test). Example: "Last name is Johnson" → "Johnson"`),
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .describe(`Date of birth in YYYY-MM-DD format. ${getCurrentDateContext()} Example: "January 20, 1990" → "1990-01-20"`),
  phone: z.string()
    .min(10)
    .describe(`Phone number as digits only. Example: "313-555-1200" → "3135551200"`),
  email: z.string()
    .email()
    .describe(`Email address. Convert spoken format. Example: "john at gmail dot com" → "john@gmail.com"`),
  insurance_name: z.string().optional()
    .describe("Dental insurance company name if provided (e.g., Cigna, MetLife). Optional.")
});

const createNewPatientTool: ToolDefinition<typeof createNewPatientSchema> = {
  name: "create_new_patient",
  description: `Creates new patient record when all required information is collected: first name, last name, date of birth, phone (10+ digits), and valid email. Insurance name is optional. CRITICAL: Only call when you have ALL required fields - do not call with missing or empty values.`,
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
      // Validate all required fields are present and valid
      const validationResult = validatePatientData(args);
      if (!validationResult.isValid) {
        return {
          success: false,
          error_code: validationResult.errorCode || "VALIDATION_ERROR",
          message_to_patient: validationResult.message || "There was an issue with the information provided.",
          details: validationResult.details || "Validation failed"
        };
      }

      // Get the first active provider for new patient assignment
      const activeProvider = practice.savedProviders.find(sp => sp.isActive);
      if (!activeProvider) {
        return {
          success: false,
          error_code: "NO_ACTIVE_PROVIDERS",
          message_to_patient: "I need to assign you to a provider but none are available. Please contact the office to complete your registration."
        };
      }

      // Prepare new patient data in EXACT NexHealth API format (matching your curl example)
      const patientBio: {
        date_of_birth: string;
        phone_number: string;
        gender: string;
        insurance_name?: string;
      } = {
        date_of_birth: args.dateOfBirth,
        phone_number: args.phone,
        gender: "Female" // Default as per API example - this can be enhanced later
      };

      // Add insurance_name if provided
      if (args.insurance_name && args.insurance_name.trim() !== "") {
        patientBio.insurance_name = args.insurance_name.trim();
      }

      const newPatientData = {
        provider: { 
          provider_id: parseInt(activeProvider.provider.nexhealthProviderId) 
        },
        patient: {
          first_name: args.firstName,
          last_name: args.lastName,
          email: args.email,
          bio: patientBio
        }
      };

      console.log(`[createNewPatient] Creating patient: ${args.firstName} ${args.lastName}`);
      console.log(`[createNewPatient] Patient data:`, JSON.stringify(newPatientData, null, 2));

      const createResponse = await fetchNexhealthAPI(
        '/patients',
        practice.nexhealthSubdomain,
        { location_id: practice.nexhealthLocationId },
        'POST',
        newPatientData
      );

      console.log(`[createNewPatient] API Response:`, JSON.stringify(createResponse, null, 2));

      // Extract patient ID from response (following your curl response format)
      let newPatientId = null;
      if (createResponse?.data?.user?.id) {
        newPatientId = createResponse.data.user.id;
      } else if (createResponse?.data?.id) {
        newPatientId = createResponse.data.id;
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

      // Format confirmation message
      const formattedPhone = formatPhoneForDisplay(args.phone);

      // Create context-aware success message based on insurance information
      let successMessage: string;
      if (args.insurance_name && args.insurance_name.trim() !== "") {
        successMessage = `Excellent! I've successfully created your patient profile for ${args.firstName} ${args.lastName}. I've also noted your ${args.insurance_name} insurance. To make sure we have all the details, could you provide the subscriber's full name on that policy?`;
      } else {
        successMessage = `Excellent! I've successfully created your patient profile for ${args.firstName} ${args.lastName}. Welcome to ${practice.name || 'our practice'}! Now, what type of appointment were you looking to schedule today?`;
      }

      return {
        success: true,
        message_to_patient: successMessage,
        data: {
          patient_id: String(newPatientId), // Ensure string format for consistency with bookAppointment.ts
          patient_name: `${args.firstName} ${args.lastName}`,
          date_of_birth: args.dateOfBirth,
          phone: formattedPhone,
          email: args.email,
          insurance_name: args.insurance_name || null,
          created: true
        }
      };

    } catch (error) {
      console.error(`[createNewPatient] Error:`, error);
      
      let message = "I'm having trouble creating your patient record right now. Please contact the office directly to register.";
      let errorCode = "PATIENT_CREATION_ERROR";
      
      if (error instanceof Error) {
        if (error.message.includes("400") || error.message.includes("validation")) {
          errorCode = "VALIDATION_ERROR";
          message = "There was an issue with the information provided. Let me help you with the registration process.";
        } else if (error.message.includes("409") || error.message.includes("duplicate")) {
          errorCode = "DUPLICATE_PATIENT";
          message = `It looks like you're already in our system, ${args.firstName}! I've found your existing record. Will you be using the same insurance we have on file, or has anything changed?`;
        } else if (error.message.includes("401")) {
          errorCode = "AUTH_ERROR";
          message = "There's an authentication issue with our system. Please contact the office to register.";
        }
      }
      
      return {
        success: false,
        error_code: errorCode,
        message_to_patient: message,
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  messages: {
    start: "Let me gather the information needed to create your patient record...",
    success: "Okay, patient registration processed.",
    fail: "There was an issue with the registration."
  }
};

/**
 * Validate patient data with comprehensive checks
 */
function validatePatientData(args: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
}): 
  | { isValid: true; errorCode?: undefined; message?: undefined; details?: undefined }
  | { isValid: false; errorCode: string; message: string; details: string } {
  
  // Check first name
  if (!args.firstName || args.firstName.trim().length === 0) {
    return {
      isValid: false,
      errorCode: "MISSING_FIRST_NAME",
      message: "I need your first name to create your patient record. Could you tell me your first name?",
      details: "First name is required"
    };
  }

  // Check last name
  if (!args.lastName || args.lastName.trim().length === 0) {
    return {
      isValid: false,
      errorCode: "MISSING_LAST_NAME",
      message: "I need your last name to create your patient record. Could you tell me your last name?",
      details: "Last name is required"
    };
  }

  // Check date of birth format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!args.dateOfBirth || !dateRegex.test(args.dateOfBirth)) {
    return {
      isValid: false,
      errorCode: "INVALID_DATE_OF_BIRTH",
      message: "I need your date of birth in a valid format. Could you tell me your date of birth again?",
      details: "Date of birth must be in YYYY-MM-DD format"
    };
  }

  // Check phone number
  if (!args.phone || args.phone.length < 10) {
    return {
      isValid: false,
      errorCode: "MISSING_PHONE",
      message: "I need your phone number to create your patient record. What's your phone number?",
      details: "Phone number is required and must be at least 10 digits"
    };
  }

  // Check email
  if (!args.email || !args.email.includes('@')) {
    return {
      isValid: false,
      errorCode: "MISSING_EMAIL",
      message: "I need your email address to create your patient record. What's your email address?",
      details: "Valid email address is required"
    };
  }

  // Additional phone validation - ensure it's digits only
  const phoneDigits = args.phone.replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    return {
      isValid: false,
      errorCode: "INVALID_PHONE",
      message: "I didn't get a valid phone number. Could you tell me your phone number again?",
      details: "Phone number must contain at least 10 digits"
    };
  }

  return { isValid: true };
}

/**
 * Format phone number for display
 */
function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/**
 * Update call log with new patient ID
 */
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