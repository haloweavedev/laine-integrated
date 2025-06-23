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
  firstName: z.string().optional()
    .describe(`Patient's first name. If spelled out (B-O-B), convert to proper form (Bob). Example: "My name is Sarah" → "Sarah"`),
  lastName: z.string().optional()
    .describe(`Patient's last name. If spelled out (T-E-S-T), convert to proper form (Test). Example: "Last name is Johnson" → "Johnson"`),
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional()
    .describe(`Date of birth in YYYY-MM-DD format. ${getCurrentDateContext()} Example: "January 20, 1990" → "1990-01-20"`),
  phone: z.string().optional()
    .describe(`Phone number as digits only. Example: "313-555-1200" → "3135551200"`),
  email: z.string().optional()
    .describe(`Email address. Convert spoken format. Example: "john at gmail dot com" → "john@gmail.com"`),
  insurance_name: z.string().optional()
    .describe("Dental insurance company name if provided (e.g., Cigna, MetLife). Optional."),
  userConfirmation: z.boolean().optional()
    .describe("True when user confirms all collected details are correct before creating patient record")
});

const createNewPatientTool: ToolDefinition<typeof createNewPatientSchema> = {
  name: "create_new_patient",
  description: "Creates a new patient record in the EHR system through staged collection. Call when patient is NEW or find_patient_in_ehr fails. Gathers information step-by-step: firstName, lastName, dateOfBirth (YYYY-MM-DD), phone (10+ digits), email. Confirms all details before API call. Returns patient_id, patient_name.",
  schema: createNewPatientSchema,
  prerequisites: [
    { argName: 'firstName', askUserMessage: "To create your patient record, could you please tell me your first name?" },
    { argName: 'lastName', askUserMessage: "And what is your last name?" },
    { argName: 'dateOfBirth', askUserMessage: "What is your date of birth, including the year?" },
    { argName: 'phone', askUserMessage: "What's a good phone number we can reach you at?" },
    { argName: 'email', askUserMessage: "And finally, what is your email address?" }
  ],
  
  async run({ args, context }): Promise<ToolResult> {
    const { practice, vapiCallId, conversationState } = context;
    
    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return {
        success: false,
        error_code: "PRACTICE_CONFIG_MISSING",
        message_to_patient: "",
        details: "Missing practice configuration"
      };
    }

    if (!practice.savedProviders || practice.savedProviders.length === 0) {
      return {
        success: false,
        error_code: "NO_SAVED_PROVIDERS",
        message_to_patient: "",
        details: "No providers configured"
      };
    }

    // Set patient status to 'new' if not already set
    if (conversationState.patientStatus === 'unknown') {
      conversationState.updatePatientStatus('new');
    }

    try {
      // Update ConversationState with any new information from args
      if (args.firstName && typeof args.firstName === 'string') {
        conversationState.updateNewPatientDetail('firstName', args.firstName.trim());
      }
      if (args.lastName && typeof args.lastName === 'string') {
        conversationState.updateNewPatientDetail('lastName', args.lastName.trim());
      }
      if (args.dateOfBirth && typeof args.dateOfBirth === 'string') {
        conversationState.updateNewPatientDetail('dob', args.dateOfBirth);
      }
      if (args.phone && typeof args.phone === 'string') {
        // Clean phone number to digits only
        const cleanPhone = args.phone.replace(/\D/g, '');
        conversationState.updateNewPatientDetail('phone', cleanPhone);
      }
      if (args.email && typeof args.email === 'string') {
        conversationState.updateNewPatientDetail('email', args.email.toLowerCase().trim());
      }
      if (args.insurance_name && typeof args.insurance_name === 'string') {
        conversationState.updateNewPatientDetail('insuranceName', args.insurance_name.trim());
      }

      // Check if all required fields are collected
      const { firstName, lastName, dob, phone, email } = conversationState.newPatientInfo;
      const allFieldsCollected = firstName && lastName && dob && phone && email;

      // If not all fields collected, determine what to ask for next
      if (!allFieldsCollected) {
        let nextDetailToCollect = null;
        
        if (!firstName) {
          nextDetailToCollect = 'firstName';
        } else if (!lastName) {
          nextDetailToCollect = 'lastName';
        } else if (!dob) {
          nextDetailToCollect = 'dateOfBirth';
        } else if (!phone) {
          nextDetailToCollect = 'phone';
        } else if (!email) {
          nextDetailToCollect = 'email';
        }

        return {
          success: true,
          message_to_patient: "",
          data: {
            action_needed: "collect_next_detail",
            next_detail_to_collect: nextDetailToCollect,
            current_details: conversationState.newPatientInfo
          }
        };
      }

      // All details collected - check if user has confirmed
      if (!conversationState.newPatientInfoConfirmation.allDetailsConfirmed && !args.userConfirmation) {
        return {
          success: true,
          message_to_patient: "",
          data: {
            action_needed: "confirm_all_details",
            patient_details_for_confirmation: {
              firstName: conversationState.newPatientInfo.firstName,
              lastName: conversationState.newPatientInfo.lastName,
              dateOfBirth: conversationState.newPatientInfo.dob,
              phone: formatPhoneForDisplay(conversationState.newPatientInfo.phone!),
              email: conversationState.newPatientInfo.email,
              insuranceName: conversationState.newPatientInfo.insuranceName
            }
          }
        };
      }

      // User has confirmed OR userConfirmation is true - proceed with API call
      if (args.userConfirmation || conversationState.newPatientInfoConfirmation.allDetailsConfirmed) {
        conversationState.setAllNewPatientDetailsConfirmed(true);
      }

      // Validate all required fields before API call
      const patientData = {
        firstName: conversationState.newPatientInfo.firstName!,
        lastName: conversationState.newPatientInfo.lastName!,
        dateOfBirth: conversationState.newPatientInfo.dob!,
        phone: conversationState.newPatientInfo.phone!,
        email: conversationState.newPatientInfo.email!
      };

      const validationResult = validatePatientData(patientData);
      if (!validationResult.isValid) {
        return {
          success: false,
          error_code: validationResult.errorCode || "VALIDATION_ERROR",
          message_to_patient: "",
          details: validationResult.details || "Validation failed"
        };
      }

      // Get the first active provider for new patient assignment
      const activeProvider = practice.savedProviders.find(sp => sp.isActive);
      if (!activeProvider) {
        return {
          success: false,
          error_code: "NO_ACTIVE_PROVIDERS",
          message_to_patient: "",
          details: "No active providers"
        };
      }

      // Prepare new patient data in EXACT NexHealth API format
      const patientBio: {
        date_of_birth: string;
        phone_number: string;
        gender: string;
        insurance_name?: string;
      } = {
        date_of_birth: patientData.dateOfBirth,
        phone_number: patientData.phone,
        gender: "Female" // Default as per API example - this can be enhanced later
      };

      // Add insurance_name if provided
      if (conversationState.newPatientInfo.insuranceName && conversationState.newPatientInfo.insuranceName.trim() !== "") {
        patientBio.insurance_name = conversationState.newPatientInfo.insuranceName.trim();
      }

      const newPatientData = {
        provider: { 
          provider_id: parseInt(activeProvider.provider.nexhealthProviderId) 
        },
        patient: {
          first_name: patientData.firstName,
          last_name: patientData.lastName,
          email: patientData.email,
          bio: patientBio
        }
      };

      console.log(`[createNewPatient] Creating patient: ${patientData.firstName} ${patientData.lastName}`);
      console.log(`[createNewPatient] Patient data:`, JSON.stringify(newPatientData, null, 2));

      const createResponse = await fetchNexhealthAPI(
        '/patients',
        practice.nexhealthSubdomain,
        { location_id: practice.nexhealthLocationId },
        'POST',
        newPatientData
      );

      console.log(`[createNewPatient] API Response:`, JSON.stringify(createResponse, null, 2));

      // Extract patient ID from response
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
          message_to_patient: "",
          details: "Could not extract patient ID from response"
        };
      }

      // Update ConversationState with new patient ID
      conversationState.updatePatient(String(newPatientId));
      
      // Update patient status to 'existing' since they now exist in the system
      conversationState.updatePatientStatus('existing');
      
      // Clear the collected new patient info since creation is complete
      conversationState.resetNewPatientInfo();

      // Update call log with new patient ID for backward compatibility
      await updateCallLogWithPatient(vapiCallId, practice.id, String(newPatientId));

      // Format confirmation message
      const formattedPhone = formatPhoneForDisplay(patientData.phone);

      return {
        success: true,
        message_to_patient: "",
        data: {
          patient_id: String(newPatientId),
          patient_name: `${patientData.firstName} ${patientData.lastName}`,
          first_name: patientData.firstName,
          last_name: patientData.lastName,
          date_of_birth: patientData.dateOfBirth,
          phone: formattedPhone,
          email: patientData.email,
          insurance_name: conversationState.newPatientInfo.insuranceName || null,
          practice_name: practice.name,
          created: true,
          has_insurance: !!(conversationState.newPatientInfo.insuranceName && conversationState.newPatientInfo.insuranceName.trim() !== "")
        }
      };

    } catch (error) {
      console.error(`[createNewPatient] Error:`, error);
      
      let errorCode = "PATIENT_CREATION_ERROR";
      
      if (error instanceof Error) {
        if (error.message.includes("400") || error.message.includes("validation")) {
          errorCode = "VALIDATION_ERROR";
        } else if (error.message.includes("409") || error.message.includes("duplicate")) {
          errorCode = "DUPLICATE_PATIENT";
        } else if (error.message.includes("401")) {
          errorCode = "AUTH_ERROR";
        }
      }
      
      return {
        success: false,
        error_code: errorCode,
        message_to_patient: "",
        details: error instanceof Error ? error.message : "Unknown error",
        data: {
          attempted_patient_name: `${conversationState.newPatientInfo.firstName || ''} ${conversationState.newPatientInfo.lastName || ''}`.trim() || 'Unknown',
          first_name: conversationState.newPatientInfo.firstName,
          last_name: conversationState.newPatientInfo.lastName
        }
      };
    }
  }
};

function validatePatientData(args: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
}): 
  | { isValid: true; errorCode?: undefined; message?: undefined; details?: undefined }
  | { isValid: false; errorCode: string; message: string; details: string } {
  
  // Check required fields
  if (!args.firstName.trim()) {
    return {
      isValid: false,
      errorCode: "MISSING_FIRST_NAME",
      message: "First name is required",
      details: "Missing or empty first name"
    };
  }

  if (!args.lastName.trim()) {
    return {
      isValid: false,
      errorCode: "MISSING_LAST_NAME", 
      message: "Last name is required",
      details: "Missing or empty last name"
    };
  }

  // Validate date of birth format and reasonableness
  const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dobRegex.test(args.dateOfBirth)) {
    return {
      isValid: false,
      errorCode: "INVALID_DATE_OF_BIRTH",
      message: "Date of birth must be in YYYY-MM-DD format",
      details: `Invalid date format: ${args.dateOfBirth}`
    };
  }

  const dobDate = new Date(args.dateOfBirth);
  const today = new Date();
  const minAge = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
  const maxAge = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

  if (dobDate < minAge || dobDate > maxAge) {
    return {
      isValid: false,
      errorCode: "INVALID_DATE_OF_BIRTH",
      message: "Date of birth seems unreasonable",
      details: `DOB outside reasonable range: ${args.dateOfBirth}`
    };
  }

  // Validate phone (minimum 10 digits)
  const phoneDigits = args.phone.replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    return {
      isValid: false,
      errorCode: "INVALID_PHONE",
      message: "Phone number must be at least 10 digits",
      details: `Phone too short: ${phoneDigits.length} digits`
    };
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(args.email)) {
    return {
      isValid: false,
      errorCode: "INVALID_EMAIL",
      message: "Email address format is invalid",
      details: `Invalid email format: ${args.email}`
    };
  }

  return { isValid: true };
}

function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone; // Return as-is if not 10 digits
}

async function updateCallLogWithPatient(vapiCallId: string, practiceId: string, patientId: string) {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.callLog.upsert({
      where: { vapiCallId },
      create: {
        vapiCallId,
        practiceId,
        callStatus: "PATIENT_CREATED",
        nexhealthPatientId: patientId,
        callTimestampStart: new Date()
      },
      update: {
        nexhealthPatientId: patientId,
        callStatus: "PATIENT_CREATED",
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error("[createNewPatient] Error updating call log:", error);
  }
}

export default createNewPatientTool; 