/**
 * ConversationState Module
 * 
 * Manages conversational state throughout a VAPI call, storing information
 * gathered during the conversation for smoother transitions and context retention.
 */

/**
 * Class for managing conversational state during a VAPI call
 */
export class ConversationState {
  public readonly practiceId: string;
  public readonly vapiCallId: string;
  public readonly assistantId: string;
  
  // Patient identification
  public identifiedPatientId: string | null = null;
  public patientStatus: 'new' | 'existing' | 'unknown' = 'unknown';
  
  // New patient information (structured)
  public newPatientInfo: {
    firstName: string | null;
    lastName: string | null;
    dob: string | null; // YYYY-MM-DD
    phone: string | null; // Digits only
    email: string | null;
    insuranceName?: string | null; // Optional
  } = { firstName: null, lastName: null, dob: null, phone: null, email: null, insuranceName: null };

  public newPatientInfoConfirmation: {
    firstNameConfirmed: boolean;
    lastNameConfirmed: boolean;
    dobConfirmed: boolean;
    phoneConfirmed: boolean;
    emailConfirmed: boolean;
    allDetailsConfirmed: boolean; // Overall confirmation before API call
  } = { firstNameConfirmed: false, lastNameConfirmed: false, dobConfirmed: false, phoneConfirmed: false, emailConfirmed: false, allDetailsConfirmed: false };
  
  // Appointment type determination
  public determinedAppointmentTypeId: string | null = null; // Laine CUID of AppointmentType
  public determinedAppointmentTypeName: string | null = null;
  public determinedDurationMinutes: number | null = null;
  
  // Scheduling context
  public requestedDate: string | null = null; // YYYY-MM-DD format
  public selectedTimeSlot: Record<string, unknown> | null = null; // Details of chosen slot
  public availableSlotsForDate: unknown[] | null = null; // Available slots for the requested date
  
  // Intent and user context
  public lastUserIntent: string | null = null;
  public intent: string | null = null;
  public reasonForVisit: string | null = null;
  
  // Call summary and booking context
  public callSummaryForNote: string | undefined = undefined;
  public bookedAppointmentDetails: Record<string, unknown> | null = null;
  public practiceDetails: Record<string, unknown> | null = null;
  public bookingDetailsPresentedForConfirmation: boolean = false;

  /**
   * Constructor to initialize conversation state
   * @param practiceId - The practice ID associated with this call
   * @param vapiCallId - The VAPI call ID
   * @param assistantId - The assistant ID handling the call
   */
  constructor(practiceId: string, vapiCallId: string, assistantId: string) {
    this.practiceId = practiceId;
    this.vapiCallId = vapiCallId;
    this.assistantId = assistantId;
  }

  /**
   * Updates the identified patient ID
   * @param patientId - The NexHealth patient ID
   */
  updatePatient(patientId: string): void {
    this.identifiedPatientId = patientId;
    console.log('[ConversationState] Updated identifiedPatientId to:', this.identifiedPatientId);
  }

  /**
   * Updates the patient status (new, existing, or unknown)
   * @param status - The patient status
   */
  updatePatientStatus(status: 'new' | 'existing'): void {
    this.patientStatus = status;
    console.log('[ConversationState] Updated patientStatus to:', status);
  }

  /**
   * Updates the conversation intent
   * @param intent - The identified intent
   */
  updateIntent(intent: string): void {
    this.intent = intent;
    console.log('[ConversationState] Updated intent to:', this.intent);
  }

  /**
   * Updates the reason for visit
   * @param reason - The reason for the visit
   */
  updateReasonForVisit(reason: string): void {
    this.reasonForVisit = reason;
    console.log('[ConversationState] Updated reasonForVisit to:', this.reasonForVisit);
  }

  /**
   * Updates the determined appointment type information
   * @param typeId - The Laine CUID of the AppointmentType
   * @param name - The appointment type name
   * @param duration - The duration in minutes
   */
  updateAppointmentType(typeId: string, name: string, duration: number): void {
    this.determinedAppointmentTypeId = typeId;
    this.determinedAppointmentTypeName = name;
    this.determinedDurationMinutes = duration;
    console.log('[ConversationState] Updated appointment type:', { typeId, name, duration });
  }

  /**
   * Updates the requested date for appointments
   * @param date - The requested date in YYYY-MM-DD format
   */
  updateRequestedDate(date: string): void {
    this.requestedDate = date;
    console.log('[ConversationState] Updated requestedDate to:', this.requestedDate);
  }

  /**
   * Updates the selected time slot details
   * @param slot - The slot details object
   */
  updateSelectedSlot(slot: Record<string, unknown>): void {
    this.selectedTimeSlot = slot;
  }

  /**
   * Updates the selected time slot details
   * @param slot - The slot details object from availableSlotsForDate
   */
  updateSelectedTimeSlot(slot: Record<string, unknown> | null): void {
    this.selectedTimeSlot = slot;
    console.log('[ConversationState] Updated selectedTimeSlot to:', this.selectedTimeSlot);
  }

  /**
   * Updates available slots for the requested date
   * @param slots - Array of available slot objects
   */
  updateAvailableSlotsForDate(slots: unknown[]): void {
    this.availableSlotsForDate = slots;
    console.log('[ConversationState] Updated availableSlotsForDate with', slots?.length || 0, 'slots');
  }

  /**
   * Updates individual fields in newPatientInfo and their confirmation status
   * @param field - The field name to update
   * @param value - The field value
   * @param isConfirmed - Whether this field has been confirmed by the user
   */
  updateNewPatientDetail(field: keyof ConversationState['newPatientInfo'], value: string | null, isConfirmed: boolean = false): void {
    if (field in this.newPatientInfo) {
      (this.newPatientInfo as any)[field] = value; // eslint-disable-line @typescript-eslint/no-explicit-any
      console.log(`[ConversationState] Updated newPatientInfo.${field} to:`, value);
      
      // Update corresponding confirmation status if the field name matches
      const confField = `${field}Confirmed` as keyof ConversationState['newPatientInfoConfirmation'];
      if (confField in this.newPatientInfoConfirmation) {
        (this.newPatientInfoConfirmation as any)[confField] = isConfirmed; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (isConfirmed) {
          console.log(`[ConversationState] Confirmed newPatientInfo.${field}`);
        }
      }
    } else {
      console.warn(`[ConversationState] Attempted to update unknown newPatientInfo field: ${field}`);
    }
  }

  /**
   * Sets the overall confirmation status for all new patient details
   * @param status - Whether all details have been confirmed by the user
   */
  setAllNewPatientDetailsConfirmed(status: boolean): void {
    this.newPatientInfoConfirmation.allDetailsConfirmed = status;
    console.log('[ConversationState] Updated newPatientInfoConfirmation.allDetailsConfirmed to:', status);
  }

  /**
   * Clears all new patient data and confirmations (e.g., if user wants to start over)
   */
  resetNewPatientInfo(): void {
    this.newPatientInfo = { firstName: null, lastName: null, dob: null, phone: null, email: null, insuranceName: null };
    this.newPatientInfoConfirmation = { firstNameConfirmed: false, lastNameConfirmed: false, dobConfirmed: false, phoneConfirmed: false, emailConfirmed: false, allDetailsConfirmed: false };
    console.log('[ConversationState] Reset newPatientInfo and newPatientInfoConfirmation.');
  }

  /**
   * Sets the call summary for appointment notes
   * @param summary - The call summary text
   */
  setCallSummary(summary: string): void {
    this.callSummaryForNote = summary;
    console.log('[ConversationState] Updated callSummaryForNote');
  }

  /**
   * Updates the booking details presented for confirmation flag
   * @param status - Whether booking details have been presented to the user for confirmation
   */
  updateBookingDetailsPresentedForConfirmation(status: boolean): void {
    this.bookingDetailsPresentedForConfirmation = status;
    console.log('[ConversationState] Updated bookingDetailsPresentedForConfirmation to:', status);
  }

  /**
   * Updates the booked appointment details
   * @param details - The booked appointment details or null to clear
   */
  updateBookedAppointmentDetails(details: Record<string, unknown> | null): void {
    this.bookedAppointmentDetails = details;
    if (details) {
      console.log('[ConversationState] Updated bookedAppointmentDetails:', this.bookedAppointmentDetails);
    } else {
      console.log('[ConversationState] Cleared bookedAppointmentDetails.');
    }
  }

  /**
   * Returns a snapshot of the current state as a plain object
   * Useful for logging, debugging, or passing context
   * @returns Plain object representation of the current state
   */
  getStateSnapshot(): Record<string, unknown> {
    return {
      practiceId: this.practiceId,
      vapiCallId: this.vapiCallId,
      assistantId: this.assistantId,
      identifiedPatientId: this.identifiedPatientId,
      patientStatus: this.patientStatus,
      newPatientInfo: this.newPatientInfo,
      newPatientInfoConfirmation: this.newPatientInfoConfirmation,
      determinedAppointmentTypeId: this.determinedAppointmentTypeId,
      determinedAppointmentTypeName: this.determinedAppointmentTypeName,
      determinedDurationMinutes: this.determinedDurationMinutes,
      requestedDate: this.requestedDate,
      selectedTimeSlot: this.selectedTimeSlot,
      availableSlotsForDate: this.availableSlotsForDate,
      lastUserIntent: this.lastUserIntent,
      intent: this.intent,
      reasonForVisit: this.reasonForVisit,
      callSummaryForNote: this.callSummaryForNote,
      bookedAppointmentDetails: this.bookedAppointmentDetails,
      practiceDetails: this.practiceDetails,
      bookingDetailsPresentedForConfirmation: this.bookingDetailsPresentedForConfirmation
    };
  }
} 