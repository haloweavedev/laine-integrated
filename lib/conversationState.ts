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

  /**
   * Restores conversation state from a snapshot object
   * @param snapshot - A snapshot object previously created with getStateSnapshot()
   */
  restoreFromSnapshot(snapshot: Record<string, unknown>): void {
    // Restore basic fields
    if (typeof snapshot.identifiedPatientId === 'string') {
      this.identifiedPatientId = snapshot.identifiedPatientId;
    }
    if (snapshot.patientStatus === 'new' || snapshot.patientStatus === 'existing' || snapshot.patientStatus === 'unknown') {
      this.patientStatus = snapshot.patientStatus;
    }
    
    // Restore new patient info
    if (snapshot.newPatientInfo && typeof snapshot.newPatientInfo === 'object') {
      const info = snapshot.newPatientInfo as Record<string, unknown>;
      this.newPatientInfo = {
        firstName: typeof info.firstName === 'string' ? info.firstName : null,
        lastName: typeof info.lastName === 'string' ? info.lastName : null,
        dob: typeof info.dob === 'string' ? info.dob : null,
        phone: typeof info.phone === 'string' ? info.phone : null,
        email: typeof info.email === 'string' ? info.email : null,
        insuranceName: typeof info.insuranceName === 'string' ? info.insuranceName : null,
      };
    }
    
    // Restore confirmation status
    if (snapshot.newPatientInfoConfirmation && typeof snapshot.newPatientInfoConfirmation === 'object') {
      const conf = snapshot.newPatientInfoConfirmation as Record<string, unknown>;
      this.newPatientInfoConfirmation = {
        firstNameConfirmed: Boolean(conf.firstNameConfirmed),
        lastNameConfirmed: Boolean(conf.lastNameConfirmed),
        dobConfirmed: Boolean(conf.dobConfirmed),
        phoneConfirmed: Boolean(conf.phoneConfirmed),
        emailConfirmed: Boolean(conf.emailConfirmed),
        allDetailsConfirmed: Boolean(conf.allDetailsConfirmed),
      };
    }
    
    // Restore appointment type
    if (typeof snapshot.determinedAppointmentTypeId === 'string') {
      this.determinedAppointmentTypeId = snapshot.determinedAppointmentTypeId;
    }
    if (typeof snapshot.determinedAppointmentTypeName === 'string') {
      this.determinedAppointmentTypeName = snapshot.determinedAppointmentTypeName;
    }
    if (typeof snapshot.determinedDurationMinutes === 'number') {
      this.determinedDurationMinutes = snapshot.determinedDurationMinutes;
    }
    
    // Restore scheduling context
    if (typeof snapshot.requestedDate === 'string') {
      this.requestedDate = snapshot.requestedDate;
    }
    if (snapshot.selectedTimeSlot && typeof snapshot.selectedTimeSlot === 'object') {
      this.selectedTimeSlot = { ...snapshot.selectedTimeSlot as Record<string, unknown> };
    }
    if (Array.isArray(snapshot.availableSlotsForDate)) {
      this.availableSlotsForDate = [...snapshot.availableSlotsForDate];
    }
    
    // Restore intent and context
    if (typeof snapshot.lastUserIntent === 'string') {
      this.lastUserIntent = snapshot.lastUserIntent;
    }
    if (typeof snapshot.intent === 'string') {
      this.intent = snapshot.intent;
    }
    if (typeof snapshot.reasonForVisit === 'string') {
      this.reasonForVisit = snapshot.reasonForVisit;
    }
    
    // Restore call summary and booking details
    if (typeof snapshot.callSummaryForNote === 'string') {
      this.callSummaryForNote = snapshot.callSummaryForNote;
    }
    if (snapshot.bookedAppointmentDetails && typeof snapshot.bookedAppointmentDetails === 'object') {
      this.bookedAppointmentDetails = { ...snapshot.bookedAppointmentDetails as Record<string, unknown> };
    }
    if (snapshot.practiceDetails && typeof snapshot.practiceDetails === 'object') {
      this.practiceDetails = { ...snapshot.practiceDetails as Record<string, unknown> };
    }
    if (typeof snapshot.bookingDetailsPresentedForConfirmation === 'boolean') {
      this.bookingDetailsPresentedForConfirmation = snapshot.bookingDetailsPresentedForConfirmation;
    }
    
    console.log('[ConversationState] Successfully restored state from snapshot');
  }

  /**
   * VAPI COMPLIANCE: Validates the integrity of the conversation state
   * Checks for common issues that could cause VAPI flow problems
   * @returns Object containing validation results and any issues found
   */
  validateStateIntegrity(): {
    isValid: boolean;
    issues: string[];
    warnings: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Core identity validation
    if (!this.practiceId || typeof this.practiceId !== 'string') {
      issues.push('Missing or invalid practiceId');
    }
    if (!this.vapiCallId || typeof this.vapiCallId !== 'string') {
      issues.push('Missing or invalid vapiCallId');
    }
    if (!this.assistantId || typeof this.assistantId !== 'string') {
      issues.push('Missing or invalid assistantId');
    }

    // Patient status consistency validation
    if (this.patientStatus === 'new' && this.identifiedPatientId) {
      warnings.push('Patient status is "new" but identifiedPatientId is set - potential inconsistency');
    }
    if (this.patientStatus === 'existing' && !this.identifiedPatientId) {
      warnings.push('Patient status is "existing" but no identifiedPatientId set');
    }

    // New patient info validation for "new" patients
    if (this.patientStatus === 'new') {
      if (!this.newPatientInfo.firstName && !this.newPatientInfo.lastName) {
        recommendations.push('New patient registration in progress - collect name details next');
      }
      
      // Check for incomplete confirmations
      if (this.newPatientInfo.firstName && !this.newPatientInfoConfirmation.firstNameConfirmed) {
        recommendations.push('First name collected but not confirmed - consider spelling confirmation');
      }
      if (this.newPatientInfo.lastName && !this.newPatientInfoConfirmation.lastNameConfirmed) {
        recommendations.push('Last name collected but not confirmed - consider spelling confirmation');
      }
      
      // Check for missing required fields if names are confirmed
      if (this.newPatientInfoConfirmation.firstNameConfirmed && this.newPatientInfoConfirmation.lastNameConfirmed) {
        if (!this.newPatientInfo.dob) {
          recommendations.push('Names confirmed but missing date of birth');
        }
        if (!this.newPatientInfo.phone) {
          recommendations.push('Names confirmed but missing phone number');
        }
        if (!this.newPatientInfo.email) {
          recommendations.push('Names confirmed but missing email address');
        }
      }
    }

    // Appointment type consistency validation
    if (this.determinedAppointmentTypeId && !this.determinedAppointmentTypeName) {
      warnings.push('Appointment type ID set without corresponding name');
    }
    if (this.determinedAppointmentTypeName && !this.determinedAppointmentTypeId) {
      warnings.push('Appointment type name set without corresponding ID');
    }
    if (this.determinedAppointmentTypeId && !this.determinedDurationMinutes) {
      warnings.push('Appointment type set but duration is missing');
    }

    // Scheduling flow validation
    if (this.requestedDate && !this.determinedAppointmentTypeId) {
      recommendations.push('Date requested but appointment type not determined yet');
    }
    if (this.selectedTimeSlot && !this.requestedDate) {
      warnings.push('Time slot selected but no requested date set');
    }
    if (this.availableSlotsForDate && !this.requestedDate) {
      warnings.push('Available slots loaded but no requested date set');
    }

    // Intent validation
    if (this.intent && this.intent.includes('BOOK') && this.patientStatus === 'unknown') {
      recommendations.push('Booking intent detected but patient status unknown - determine if new or existing');
    }
    if (this.reasonForVisit && !this.intent) {
      warnings.push('Reason for visit captured but no intent set');
    }

    // Booking confirmation flow validation
    if (this.bookingDetailsPresentedForConfirmation && !this.selectedTimeSlot) {
      warnings.push('Booking details presented for confirmation but no time slot selected');
    }

    // Date format validation
    if (this.requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(this.requestedDate)) {
      issues.push('Requested date is not in YYYY-MM-DD format');
    }
    if (this.newPatientInfo.dob && !/^\d{4}-\d{2}-\d{2}$/.test(this.newPatientInfo.dob)) {
      issues.push('Date of birth is not in YYYY-MM-DD format');
    }

    const isValid = issues.length === 0;

    return {
      isValid,
      issues,
      warnings,
      recommendations
    };
  }

  /**
   * VAPI COMPLIANCE: Generates a health report for debugging and monitoring
   * @returns Comprehensive state health information
   */
  generateHealthReport(): {
    stateSize: number;
    completeness: {
      identityComplete: boolean;
      intentCaptured: boolean;
      patientStatusDetermined: boolean;
      appointmentTypeSelected: boolean;
      schedulingInProgress: boolean;
      readyForBooking: boolean;
    };
    flowPosition: string;
    validation: ReturnType<ConversationState['validateStateIntegrity']>;
  } {
    const snapshot = this.getStateSnapshot();
    const stateSize = JSON.stringify(snapshot).length;

    const completeness = {
      identityComplete: !!(this.practiceId && this.vapiCallId && this.assistantId),
      intentCaptured: !!this.intent,
      patientStatusDetermined: this.patientStatus !== 'unknown',
      appointmentTypeSelected: !!(this.determinedAppointmentTypeId && this.determinedAppointmentTypeName),
      schedulingInProgress: !!(this.requestedDate || this.availableSlotsForDate),
      readyForBooking: !!(
        this.determinedAppointmentTypeId && 
        (this.identifiedPatientId || (this.patientStatus === 'new' && this.newPatientInfo.firstName && this.newPatientInfo.lastName)) &&
        this.selectedTimeSlot
      )
    };

    // Determine current flow position
    let flowPosition = 'initialization';
    if (completeness.intentCaptured) {
      if (!completeness.patientStatusDetermined) {
        flowPosition = 'determining_patient_status';
      } else if (this.patientStatus === 'new' && !this.newPatientInfo.firstName) {
        flowPosition = 'collecting_patient_info';
      } else if (this.patientStatus === 'existing' && !this.identifiedPatientId) {
        flowPosition = 'finding_existing_patient';
      } else if (!completeness.appointmentTypeSelected) {
        flowPosition = 'selecting_appointment_type';
      } else if (!completeness.schedulingInProgress) {
        flowPosition = 'scheduling_setup';
      } else if (!this.selectedTimeSlot) {
        flowPosition = 'time_selection';
      } else if (completeness.readyForBooking) {
        flowPosition = 'ready_for_booking';
      } else {
        flowPosition = 'booking_prerequisites';
      }
    }

    const validation = this.validateStateIntegrity();

    return {
      stateSize,
      completeness,
      flowPosition,
      validation
    };
  }
} 