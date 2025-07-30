import type { VapiTool } from '@/types/vapi';
import { getFindAppointmentTypeTool } from './definitions/findAppointmentTypeTool';
import { getCreatePatientRecordTool } from './definitions/createPatientRecordTool';
import { getFindAndConfirmPatientTool } from './definitions/findAndConfirmPatientTool';
import { getCheckAvailableSlotsTool } from './definitions/checkAvailableSlotsTool';
import { getSelectAndConfirmSlotTool } from './definitions/selectAndConfirmSlotTool';
import { getConfirmBookingTool } from './definitions/confirmBookingTool';
import { getInsuranceInfoTool } from './definitions/insuranceInfoTool';

/**
 * Central map of all tool definitions
 * Keys are tool names, values are tool-getter functions
 */
export const toolDefinitionMap = {
  findAppointmentType: getFindAppointmentTypeTool,
  create_patient_record: getCreatePatientRecordTool,
  findAndConfirmPatient: getFindAndConfirmPatientTool,
  checkAvailableSlots: getCheckAvailableSlotsTool,
  selectAndConfirmSlot: getSelectAndConfirmSlotTool,
  confirmBooking: getConfirmBookingTool,
  insuranceInfo: getInsuranceInfoTool,
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