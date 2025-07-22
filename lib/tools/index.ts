import type { VapiTool } from '@/types/vapi';
import { getFindAppointmentTypeTool } from './definitions/findAppointmentTypeTool';
import { getCheckAvailableSlotsTool } from './definitions/checkAvailableSlotsTool';
import { getConfirmBookingTool } from './definitions/confirmBookingTool';
// import { getAnotherTool } from './definitions/anotherTool'; // Future tool

/**
 * Aggregate all individual tool definitions for use when updating the VAPI assistant
 * @param appBaseUrl - The base URL for the application (used in tool server URLs)
 * @returns Array of all available VAPI tool definitions
 */
export function getAllTools(appBaseUrl: string): VapiTool[] {
  const tools: VapiTool[] = [
    getFindAppointmentTypeTool(appBaseUrl),
    getCheckAvailableSlotsTool(appBaseUrl),
    getConfirmBookingTool(appBaseUrl),
    // getAnotherTool(appBaseUrl), // Future tool
  ];
  return tools;
}

// Legacy function name for backward compatibility - will be removed in future
export function buildVapiTools(appBaseUrl: string): VapiTool[] {
  console.warn('[DEPRECATION] buildVapiTools is deprecated, use getAllTools instead');
  return getAllTools(appBaseUrl);
} 