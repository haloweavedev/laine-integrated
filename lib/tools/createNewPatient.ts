import { z } from "zod";
import { ToolDefinition, ToolResult, conversationStateSchema } from "./types";
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
  fullName: z.string().optional()
    .describe(`Patient's full name (first and last together). Example: "My name is John Smith" → "John Smith"`),
  firstName: z.string().optional()
    .describe(`Patient's first name. If spelled out (B-O-B), convert to proper form (Bob). Example: "My name is Sarah" → "Sarah"`),
  lastName: z.string().optional()
    .describe(`Patient's last name. If spelled out (T-E-S-T), convert to proper form (Test). Example: "Last name is Johnson" → "Johnson"`),
  firstNameSpelling: z.string().optional()
    .describe(`Spelled-out first name for confirmation. Example: "S-A-R-A-H" → "S-A-R-A-H"`),
  lastNameSpelling: z.string().optional()
    .describe(`Spelled-out last name for confirmation. Example: "J-O-H-N-S-O-N" → "J-O-H-N-S-O-N"`),
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
    .describe("True when user confirms all collected details are correct before creating patient record"),
  conversationState: conversationStateSchema,
});

const createNewPatientTool: ToolDefinition<typeof createNewPatientSchema> = {
  name: "create_new_patient",
  description: "Creates a new patient record in the EHR system through multi-step data collection. Call when patient status is identified as NEW or when find_patient_in_ehr returns no results. Collects required information in stages: 1) Full name (first + last), 2) Spelling confirmations, 3) Date of birth (YYYY-MM-DD format), 4) Phone number (digits only), 5) Email address. Each field is individually confirmed during collection. This tool may be called multiple times during the patient registration flow as information is gathered step-by-step. Returns patient_id and patient_name upon successful creation.",
  schema: createNewPatientSchema,
  prerequisites: [
    { argName: 'fullName', askUserMessage: "To create your patient record, could you please tell me your first and last name?" },
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
      // Process incoming arguments and update conversation state
      processIncomingArguments(args, conversationState);
      
      // Determine what action is needed next based on current state
      const nextAction = determineNextAction(conversationState);
      
      if (nextAction.action_needed) {
        return {
          success: true,
          message_to_patient: "",
          data: nextAction
        };
      }

      // All required data collected - proceed with patient creation
      return await createPatientInNexHealth(conversationState, practice, vapiCallId);

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
        } else if (error.message.includes("timeout")) {
          errorCode = "TIMEOUT_ERROR";
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
          last_name: conversationState.newPatientInfo.lastName,
          current_step: getCurrentStepDescription(conversationState)
        }
      };
    }
  }
};

// Helper functions for createNewPatient tool
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processIncomingArguments(args: any, conversationState: any): void {
  // Handle fullName parsing into firstName and lastName
  if (args.fullName && typeof args.fullName === 'string') {
    const nameParts = args.fullName.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' '); // Handle middle names as part of last name
      conversationState.updateNewPatientDetail('firstName', firstName);
      conversationState.updateNewPatientDetail('lastName', lastName);
    }
  }
  
  // Handle individual firstName and lastName updates
  if (args.firstName && typeof args.firstName === 'string') {
    conversationState.updateNewPatientDetail('firstName', args.firstName.trim());
  }
  if (args.lastName && typeof args.lastName === 'string') {
    conversationState.updateNewPatientDetail('lastName', args.lastName.trim());
  }
  
  // Handle spelling confirmations - these mark the names as confirmed
  if (args.firstNameSpelling && typeof args.firstNameSpelling === 'string') {
    // Convert spelling to proper name format (remove spaces/dashes, capitalize)
    const spelledName = args.firstNameSpelling.replace(/[\s\-]/g, '').toLowerCase();
    const properName = spelledName.charAt(0).toUpperCase() + spelledName.slice(1);
    conversationState.updateNewPatientDetail('firstName', properName, true); // Mark as confirmed
  }
  if (args.lastNameSpelling && typeof args.lastNameSpelling === 'string') {
    // Convert spelling to proper name format (remove spaces/dashes, capitalize)
    const spelledName = args.lastNameSpelling.replace(/[\s\-]/g, '').toLowerCase();
    const properName = spelledName.charAt(0).toUpperCase() + spelledName.slice(1);
    conversationState.updateNewPatientDetail('lastName', properName, true); // Mark as confirmed
  }
  
  // Handle date of birth
  if (args.dateOfBirth && typeof args.dateOfBirth === 'string') {
    conversationState.updateNewPatientDetail('dob', args.dateOfBirth, true); // DOB implicit confirmation
  }
  
  // Handle phone number (clean to digits only)
  if (args.phone && typeof args.phone === 'string') {
    const cleanPhone = args.phone.replace(/\D/g, '');
    conversationState.updateNewPatientDetail('phone', cleanPhone, true); // Phone implicit confirmation
  }
  
  // Handle email address
  if (args.email && typeof args.email === 'string') {
    conversationState.updateNewPatientDetail('email', args.email.toLowerCase().trim(), true); // Email implicit confirmation
  }
  
  // Handle optional insurance
  if (args.insurance_name && typeof args.insurance_name === 'string') {
    conversationState.updateNewPatientDetail('insuranceName', args.insurance_name.trim());
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function determineNextAction(conversationState: any): any {
  const { firstName, lastName, dob, phone, email } = conversationState.newPatientInfo;
  const { firstNameConfirmed, lastNameConfirmed } = conversationState.newPatientInfoConfirmation;
  
  // Stage 1: Collect full name (first + last)
  if (!firstName || !lastName) {
    return {
      action_needed: "collect_full_name",
      current_details: conversationState.newPatientInfo
    };
  }
  
  // Stage 2: Confirm first name spelling
  if (!firstNameConfirmed) {
    return {
      action_needed: "confirm_firstName_spelling",
      firstName: firstName,
      current_details: conversationState.newPatientInfo
    };
  }
  
  // Stage 3: Confirm last name spelling  
  if (!lastNameConfirmed) {
    return {
      action_needed: "confirm_lastName_spelling",
      lastName: lastName,
      current_details: conversationState.newPatientInfo
    };
  }
  
  // Stage 4: Collect date of birth
  if (!dob) {
    return {
      action_needed: "collect_dob",
      current_details: conversationState.newPatientInfo
    };
  }
  
  // Stage 5: Collect phone number
  if (!phone) {
    return {
      action_needed: "collect_phone",
      current_details: conversationState.newPatientInfo
    };
  }
  
  // Stage 6: Collect email address
  if (!email) {
    return {
      action_needed: "collect_email",
      current_details: conversationState.newPatientInfo
    };
  }
  
  // All required data collected
  return { action_needed: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCurrentStepDescription(conversationState: any): string {
  const { firstName, lastName, dob, phone, email } = conversationState.newPatientInfo;
  const { firstNameConfirmed, lastNameConfirmed } = conversationState.newPatientInfoConfirmation;
  
  if (!firstName || !lastName) return "collecting_name";
  if (!firstNameConfirmed) return "confirming_first_name";
  if (!lastNameConfirmed) return "confirming_last_name";
  if (!dob) return "collecting_dob";
  if (!phone) return "collecting_phone";
  if (!email) return "collecting_email";
  return "creating_patient";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createPatientInNexHealth(conversationState: any, practice: any, vapiCallId: string): Promise<ToolResult> {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeProvider = practice.savedProviders.find((sp: any) => sp.isActive);
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
  
  // Update call log with new patient ID for backward compatibility
  await updateCallLogWithPatient(vapiCallId, practice.id, String(newPatientId));

  // Format confirmation message data
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
      has_insurance: !!(conversationState.newPatientInfo.insuranceName && conversationState.newPatientInfo.insuranceName.trim() !== ""),
      // Include context for success message generation
      intent: conversationState.intent,
      reasonForVisit: conversationState.reasonForVisit,
      determinedAppointmentTypeName: conversationState.determinedAppointmentTypeName
    }
  };
}

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