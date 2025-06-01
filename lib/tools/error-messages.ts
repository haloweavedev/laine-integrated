/**
 * Standardized error message templates for patient-facing responses
 * These provide consistent, professional, and helpful messages across all tools
 */

export interface ErrorMessageTemplate {
  code: string;
  message: string;
  category: 'technical' | 'validation' | 'not_found' | 'permission' | 'timeout';
}

export const ERROR_MESSAGES: Record<string, ErrorMessageTemplate> = {
  // Authentication & Permission Errors
  AUTHENTICATION_ERROR: {
    code: 'AUTHENTICATION_ERROR',
    message: "I'm having trouble accessing the system right now. Please contact the office for assistance.",
    category: 'permission'
  },
  
  PERMISSION_ERROR: {
    code: 'PERMISSION_ERROR', 
    message: "I don't have permission to access that information. Please contact the office.",
    category: 'permission'
  },

  // Practice Configuration Errors
  PRACTICE_NOT_FOUND: {
    code: 'PRACTICE_NOT_FOUND',
    message: "I'm having trouble identifying the practice settings. Please contact the office.",
    category: 'technical'
  },

  PRACTICE_NOT_CONFIGURED: {
    code: 'PRACTICE_NOT_CONFIGURED',
    message: "The practice scheduling system isn't fully set up yet. Please contact the office to schedule your appointment.",
    category: 'technical'
  },

  // Patient Lookup Errors
  PATIENT_NOT_FOUND: {
    code: 'PATIENT_NOT_FOUND',
    message: "I couldn't find your information in our system. Could you please verify your name and date of birth, or contact the office directly?",
    category: 'not_found'
  },

  PATIENT_MULTIPLE_MATCHES: {
    code: 'PATIENT_MULTIPLE_MATCHES',
    message: "I found multiple patients with similar information. For your privacy and security, please contact the office directly to schedule your appointment.",
    category: 'validation'
  },

  // Appointment Type Errors
  APPOINTMENT_TYPE_NOT_FOUND: {
    code: 'APPOINTMENT_TYPE_NOT_FOUND',
    message: "I'm not sure what type of appointment you're looking for. Could you describe what you need, or would you like me to list the available services?",
    category: 'not_found'
  },

  APPOINTMENT_TYPE_AMBIGUOUS: {
    code: 'APPOINTMENT_TYPE_AMBIGUOUS', 
    message: "I found several services that might match what you're looking for. Let me help you choose the right one.",
    category: 'validation'
  },

  // Availability & Scheduling Errors
  NO_AVAILABILITY: {
    code: 'NO_AVAILABILITY',
    message: "I don't see any available appointments for that time. Would you like me to check other dates or contact the office for more options?",
    category: 'not_found'
  },

  SCHEDULING_ERROR: {
    code: 'SCHEDULING_ERROR',
    message: "I encountered an issue while checking availability. Please try again or contact the office directly.",
    category: 'technical'
  },

  // Validation Errors
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: "I received some unexpected information. Could you try rephrasing that?",
    category: 'validation'
  },

  INVALID_DATE: {
    code: 'INVALID_DATE',
    message: "I didn't understand that date. Could you try saying it differently, like 'next Tuesday' or 'December 15th'?",
    category: 'validation'
  },

  DATE_TOO_FAR: {
    code: 'DATE_TOO_FAR',
    message: "I can only check availability up to 3 months in advance. Please choose a date within that range.",
    category: 'validation'
  },

  DATE_IN_PAST: {
    code: 'DATE_IN_PAST',
    message: "That date has already passed. Could you choose a future date for your appointment?",
    category: 'validation'
  },

  // Technical Errors
  SYSTEM_ERROR: {
    code: 'SYSTEM_ERROR',
    message: "I'm experiencing a technical issue right now. Please try again in a moment or contact the office directly.",
    category: 'technical'
  },

  TIMEOUT_ERROR: {
    code: 'TIMEOUT_ERROR',
    message: "That request is taking longer than expected. Please try again or contact the office if the issue continues.",
    category: 'timeout'
  },

  // NexHealth API Errors
  NEXHEALTH_API_ERROR: {
    code: 'NEXHEALTH_API_ERROR',
    message: "I'm having trouble connecting to the scheduling system. Please contact the office to make your appointment.",
    category: 'technical'
  },

  NEXHEALTH_RATE_LIMIT: {
    code: 'NEXHEALTH_RATE_LIMIT',
    message: "The system is busy right now. Please wait a moment and try again, or contact the office directly.",
    category: 'timeout'
  },

  // Generic Fallback
  EXECUTION_ERROR: {
    code: 'EXECUTION_ERROR',
    message: "I encountered an issue while processing your request. Please try again or contact the office for assistance.",
    category: 'technical'
  }
};

/**
 * Get a standardized error message for a given error code
 */
export function getErrorMessage(code: string): ErrorMessageTemplate {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES.EXECUTION_ERROR;
}

/**
 * Get just the patient message for a given error code
 */
export function getPatientMessage(code: string): string {
  return getErrorMessage(code).message;
}

/**
 * Determine error code from an error object
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Authentication & Permission
    if (message.includes('401') || message.includes('unauthorized')) {
      return 'AUTHENTICATION_ERROR';
    }
    if (message.includes('403') || message.includes('forbidden')) {
      return 'PERMISSION_ERROR';
    }
    
    // NexHealth specific
    if (message.includes('nexhealth')) {
      if (message.includes('rate limit') || message.includes('429')) {
        return 'NEXHEALTH_RATE_LIMIT';
      }
      return 'NEXHEALTH_API_ERROR';
    }
    
    // Validation
    if (error.name === 'ZodError' || message.includes('validation')) {
      return 'VALIDATION_ERROR';
    }
    
    // Not found
    if (message.includes('404') || message.includes('not found')) {
      return 'PATIENT_NOT_FOUND';
    }
    
    // Timeout
    if (message.includes('timeout') || message.includes('connection')) {
      return 'TIMEOUT_ERROR';
    }
  }
  
  return 'EXECUTION_ERROR';
}

/**
 * Helper to get both error code and patient message from an error
 */
export function processError(error: unknown): { code: string; message: string } {
  const code = getErrorCode(error);
  const message = getPatientMessage(code);
  return { code, message };
} 