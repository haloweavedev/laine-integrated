import type { VapiTool } from '@/types/vapi';
import { getFindAppointmentTypeTool } from './definitions/findAppointmentTypeTool';
import { getCreatePatientRecordTool } from './definitions/createPatientRecordTool';
import { getCheckAvailableSlotsTool } from './definitions/checkAvailableSlotsTool';
import { getHandleSlotSelectionTool } from './definitions/handleSlotSelectionTool';
import { getConfirmBookingTool } from './definitions/confirmBookingTool';
import { getPrepareConfirmationTool } from './definitions/prepareConfirmationTool';

/**
 * Central map of all tool definitions
 * Keys are tool names, values are tool-getter functions
 */
export const toolDefinitionMap = {
  findAppointmentType: getFindAppointmentTypeTool,
  create_patient_record: getCreatePatientRecordTool,
  checkAvailableSlots: getCheckAvailableSlotsTool,
  handleSlotSelection: getHandleSlotSelectionTool,
  prepareConfirmation: getPrepareConfirmationTool,
  confirmBooking: getConfirmBookingTool,
};

/**
 * Aggregate all individual tool definitions for use when updating the VAPI assistant
 * @param appBaseUrl - The base URL for the application (used in tool server URLs)
 * @returns Array of all available VAPI tool definitions
 */
export function getAllTools(appBaseUrl: string): VapiTool[] {
  const tools: VapiTool[] = Object.values(toolDefinitionMap).map(getToolFn => getToolFn(appBaseUrl));
  return tools;
} 