import type { SlotData } from './vapi';

/**
 * Canonical ConversationState interface for Laine AI voice assistant.
 * This interface provides comprehensive tracking of the booking flow state
 * to address critical issues with booking integrity and conversational memory.
 */
export interface ConversationState {
  callId: string;
  practiceId: string;

  patient: {
    status: 'UNKNOWN' | 'IDENTIFIED_EXISTING' | 'NEW_DETAILS_COLLECTED';
    id?: number; // NexHealth Patient ID
    firstName?: string;
    lastName?: string;
    dob?: string;
    phone?: string;
    email?: string;
    isNameConfirmed: boolean;
  };

  insurance: {
    status: 'NOT_CHECKED' | 'IN_NETWORK' | 'OUT_OF_NETWORK';
    queriedPlan?: string;
  };

  booking: {
    appointmentTypeId?: string;
    appointmentTypeName?: string;
    spokenName?: string;
    duration?: number;
    isUrgent: boolean;
    presentedSlots: SlotData[];
    // --- CRITICAL NEW FIELDS FOR BOOKING INTEGRITY ---
    selectedSlot?: SlotData;
    heldSlotId?: string; // The ID of the temporarily held slot from NexHealth
    heldSlotExpiresAt?: string; // ISO timestamp for when the hold expires
    confirmedBookingId?: string; // The final NexHealth appointment ID
  };

  // Tracks the last major action to prevent loops and redundant questions
  lastAction?: 'GREETED' | 'IDENTIFIED_APPOINTMENT_TYPE' | 'CHECKED_INSURANCE' | 'IDENTIFIED_PATIENT' | 'OFFERED_SLOTS' | 'HELD_SLOT';
}