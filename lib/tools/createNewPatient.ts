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
  patientInfo: z.string()
    .min(1)
    .describe(`
IMPORTANT: This tool handles NEW PATIENT REGISTRATION through natural conversation flow.

CONVERSATION FLOW - STEP BY STEP:
1. If missing basic info (name/DOB), ask: "Let's register you as a new patient. Can you please spell your first and last name letter by letter, then give me your date of birth?"

2. If missing phone, ask: "I need your phone number to create your patient record. What's your phone number?"

3. If missing email, ask: "Finally, I need your email address. What's your email address?"

4. Once you have ALL required information, extract and process it.

EXTRACT THE FOLLOWING from the conversation:
- First Name: Convert spelled letters (J-O-H-N → John)
- Last Name: Convert spelled letters (S-M-I-T-H → Smith)  
- Date of Birth: Convert to YYYY-MM-DD format using current context: ${getCurrentDateContext()}
- Phone Number: Extract digits only (e.g., "5553331245")
- Email: Convert spoken format (john at gmail dot com → john@gmail.com)

EXAMPLES:
User: "My name is John J-O-H-N Smith S-M-I-T-H, born January 15th 1990, phone is 555-333-1245, email john at gmail dot com"
Extract: firstName="John", lastName="Smith", dateOfBirth="1990-01-15", phone="5553331245", email="john@gmail.com"

VALIDATION RULES:
- If ANY required field is missing or unclear, ask for that specific information
- Don't proceed with patient creation until you have ALL fields
- Guide the conversation naturally to collect missing data

IMPORTANT: Only proceed with patient creation when you have complete, clear information for all fields.
    `)
});

const createNewPatientTool: ToolDefinition<typeof createNewPatientSchema> = {
  name: "create_new_patient",
  description: "Handles new patient registration through natural conversation flow. Collects required information step by step and creates the patient record when complete.",
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
      // Use LLM to extract patient information from natural conversation
      const extractedInfo = await extractPatientInfoFromConversation(args.patientInfo);
      
      // Check if we have all required information
      const missingFields = validateRequiredFields(extractedInfo);
      if (missingFields.length > 0) {
        return {
          success: false,
          error_code: "MISSING_INFORMATION",
          message_to_patient: getMissingFieldsMessage(missingFields),
          data: {
            missing_fields: missingFields,
            extracted_so_far: extractedInfo
          }
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

      // Prepare new patient data in exact NexHealth API format
      const newPatientData = {
        provider: { 
          provider_id: parseInt(activeProvider.provider.nexhealthProviderId) 
        },
        patient: {
          first_name: extractedInfo.firstName,
          last_name: extractedInfo.lastName,
          email: extractedInfo.email,
          bio: {
            date_of_birth: extractedInfo.dateOfBirth,
            phone_number: extractedInfo.phone,
            gender: "Female" // Default as per API example
          }
        }
      };

      console.log(`[createNewPatient] Creating patient: ${extractedInfo.firstName} ${extractedInfo.lastName}`);
      console.log(`[createNewPatient] Patient data:`, JSON.stringify(newPatientData, null, 2));

      const createResponse = await fetchNexhealthAPI(
        '/patients',
        practice.nexhealthSubdomain,
        { location_id: practice.nexhealthLocationId },
        'POST',
        newPatientData
      );

      console.log(`[createNewPatient] API Response:`, JSON.stringify(createResponse, null, 2));

      // Extract patient ID from response (following the response format from curl example)
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
      const formattedPhone = formatPhoneForDisplay(extractedInfo.phone || "");

      return {
        success: true,
        message_to_patient: `Perfect! I've created your patient record. Welcome to ${practice.name || 'our practice'}, ${extractedInfo.firstName || 'new patient'}! Now, what type of appointment would you like to schedule?`,
        data: {
          patient_id: String(newPatientId), // Ensure string format for consistency
          patient_name: `${extractedInfo.firstName || ''} ${extractedInfo.lastName || ''}`.trim(),
          date_of_birth: extractedInfo.dateOfBirth,
          phone: formattedPhone,
          email: extractedInfo.email,
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
          message = "It looks like you might already be in our system. Let me search for your existing record instead.";
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
    start: "Let me help you register as a new patient...",
    success: "Perfect! I've set up your patient record.",
    fail: "I'm having trouble creating your record. Let me try a different approach."
  }
};

/**
 * Extract patient information from natural conversation using LLM logic
 */
async function extractPatientInfoFromConversation(patientInfo: string): Promise<{
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
}> {
  // This simulates LLM extraction - in reality, the LLM in the schema description handles this
  // But we'll add some basic parsing as backup
  
  const extracted: Record<string, string> = {};
  
  // Extract spelled names (J-O-H-N → John)
  const spelledNameRegex = /([a-z](?:\s*-\s*[a-z])+)/gi;
  const spelledMatches = patientInfo.match(spelledNameRegex);
  if (spelledMatches) {
    spelledMatches.forEach(match => {
      const letters = match.replace(/[\s-]/g, '');
      if (letters.length >= 2) {
        const word = letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
        if (!extracted.firstName) {
          extracted.firstName = word;
        } else if (!extracted.lastName) {
          extracted.lastName = word;
        }
      }
    });
  }
  
  // Extract phone number (look for digit sequences)
  const phoneRegex = /(?:phone|number|call)(?:\s+is)?\s*[:]*\s*([0-9\s\-\(\)]+)/i;
  const phoneMatch = patientInfo.match(phoneRegex);
  if (phoneMatch) {
    extracted.phone = phoneMatch[1].replace(/\D/g, '');
  }
  
  // Extract email (look for email patterns or spoken format)
  const emailRegex = /(?:email|e-mail)(?:\s+is)?\s*[:]*\s*([^\s]+(?:\s+at\s+[^\s]+\s+dot\s+[^\s]+|@[^\s]+))/i;
  const emailMatch = patientInfo.match(emailRegex);
  if (emailMatch) {
    let email = emailMatch[1];
    // Convert spoken format: "john at gmail dot com" → "john@gmail.com"
    email = email.replace(/\s+at\s+/i, '@').replace(/\s+dot\s+/gi, '.');
    extracted.email = email;
  }
  
  // Extract date of birth
  // Look for birth date patterns
  const birthPatterns = [
    /(?:born|birth|dob)(?:\s+is|\s+on|\s*:)?\s*([^,]+)/i,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4}|\d{2})/i,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/
  ];
  
  for (const pattern of birthPatterns) {
    const match = patientInfo.match(pattern);
    if (match) {
      // Handle different date formats and convert to YYYY-MM-DD
      if (match[1] && !match[2]) {
        // Full date string like "January 15, 1990"
        const dateStr = match[1].trim();
        const parsedDate = parseNaturalDate(dateStr);
        if (parsedDate) extracted.dateOfBirth = parsedDate;
      } else if (match[1] && match[2] && match[3]) {
        // Month name format or MM/DD/YYYY
        const parsedDate = parseStructuredDate(match[1], match[2], match[3]);
        if (parsedDate) extracted.dateOfBirth = parsedDate;
      }
      break;
    }
  }
  
  return extracted;
}

/**
 * Parse natural language dates like "January 15, 1990"
 */
function parseNaturalDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch {
    // Continue to other parsing methods
  }
  return null;
}

/**
 * Parse structured dates like month/day/year
 */
function parseStructuredDate(part1: string, part2: string, part3: string): string | null {
  const months: Record<string, string> = {
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12'
  };
  
  let year, month, day;
  
  const monthKey = part1.toLowerCase();
  if (months[monthKey]) {
    // Month name format: "January 15 1990"
    month = months[monthKey];
    day = part2.padStart(2, '0');
    year = part3.length === 2 ? (parseInt(part3) >= 50 ? `19${part3}` : `20${part3}`) : part3;
  } else {
    // Numeric format: "01/15/90"
    month = part1.padStart(2, '0');
    day = part2.padStart(2, '0');
    year = part3.length === 2 ? (parseInt(part3) >= 50 ? `19${part3}` : `20${part3}`) : part3;
  }
  
  return `${year}-${month}-${day}`;
}

/**
 * Validate that all required fields are present
 */
function validateRequiredFields(info: Record<string, string>): string[] {
  const required = ['firstName', 'lastName', 'dateOfBirth', 'phone', 'email'];
  const missing = [];
  
  for (const field of required) {
    if (!info[field] || info[field].toString().trim().length === 0) {
      missing.push(field);
    }
  }
  
  // Additional validation
  if (info.phone && info.phone.length < 10) {
    missing.push('phone');
  }
  
  if (info.email && !info.email.includes('@')) {
    missing.push('email');
  }
  
  return [...new Set(missing)]; // Remove duplicates
}

/**
 * Generate appropriate message for missing fields
 */
function getMissingFieldsMessage(missingFields: string[]): string {
  if (missingFields.includes('firstName') || missingFields.includes('lastName') || missingFields.includes('dateOfBirth')) {
    return "Let's register you as a new patient. Can you please spell your first and last name letter by letter, then give me your date of birth?";
  }
  
  if (missingFields.includes('phone')) {
    return "I need your phone number to create your patient record. What's your phone number?";
  }
  
  if (missingFields.includes('email')) {
    return "Finally, I need your email address. What's your email address?";
  }
  
  return "I need some additional information to complete your registration. Could you provide your contact details?";
}

/**
 * Format phone number for display
 */
function formatPhoneForDisplay(phone: string): string {
  if (phone.length === 10) {
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
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