/**
 * ConversationState Module
 *
 * Manages essential, short-lived conversational state throughout a VAPI call.
 * This state is passed as a JSON string between VAPI and the backend.
 */

export interface NewPatientData {
  firstName?: string;
  lastName?: string;
  dob?: string; // YYYY-MM-DD
  phone?: string; // Digits only
  email?: string;
}

export interface NexHealthSlot {
  time: string;
  end_time: string;
  operatory_id: number;
}

export class ConversationState {
  public readonly vapiCallId: string;
  public readonly practiceId: string;
  public readonly assistantId: string;

  public currentStage: string; // e.g., 'initial', 'awaiting_intent_analysis', 'intent_captured_booking_new_patient_awaiting_appt_type'
  public initialUserUtterances: string[] | null;
  public determinedIntent: string | null; // e.g., 'BOOKING_NEW_PATIENT', 'BOOKING_EXISTING_PATIENT', 'GENERAL_INQUIRY'
  public reasonForVisit: string | null; // e.g., 'cleaning', 'pain_check', 'emergency'
  public isNewPatientCandidate: boolean | null; // Based on initial utterances or direct statement

  // For findAppointmentType
  public matchedLaineAppointmentTypeId: string | null;
  public matchedNexhealthAppointmentTypeId: string | null;
  public matchedAppointmentName: string | null;
  public matchedAppointmentDuration: number | null;
  public targetNexhealthProviderId: string | null; // For createNewPatient, derived from appointment type

  // For checkAvailableSlots
  public requestedDate: string | null; // YYYY-MM-DD format
  public requestedTimePreference: 'morning' | 'afternoon' | 'evening' | null;
  public availableSlotsForDate: NexHealthSlot[] | null; // Raw slot objects from NexHealth after filtering
  public presentedSlots: string[] | null; // String representations of slots presented to user

  // For createNewPatient
  public newPatientData: NewPatientData;
  public newPatientDataConfirmed: boolean; // True if all details for newPatientData are confirmed by user
  public nexhealthPatientId: string | null; // Stored after successful NexHealth patient creation

  constructor(vapiCallId: string, practiceId: string, assistantId: string) {
    this.vapiCallId = vapiCallId;
    this.practiceId = practiceId;
    this.assistantId = assistantId;

    this.currentStage = 'initial';
    this.initialUserUtterances = null;
    this.determinedIntent = null;
    this.reasonForVisit = null;
    this.isNewPatientCandidate = null;

    this.matchedLaineAppointmentTypeId = null;
    this.matchedNexhealthAppointmentTypeId = null;
    this.matchedAppointmentName = null;
    this.matchedAppointmentDuration = null;
    this.targetNexhealthProviderId = null;

    // For checkAvailableSlots
    this.requestedDate = null;
    this.requestedTimePreference = null;
    this.availableSlotsForDate = null;
    this.presentedSlots = null;

    this.newPatientData = {};
    this.newPatientDataConfirmed = false;
    this.nexhealthPatientId = null;
    
    console.log(`[ConversationState] Initialized for call ${this.vapiCallId}`);
  }

  /**
   * Returns a snapshot of the current state as a plain serializable object.
   */
  public getStateSnapshot(): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      vapiCallId: this.vapiCallId,
      practiceId: this.practiceId,
      assistantId: this.assistantId,
      currentStage: this.currentStage,
      initialUserUtterances: this.initialUserUtterances,
      determinedIntent: this.determinedIntent,
      reasonForVisit: this.reasonForVisit,
      isNewPatientCandidate: this.isNewPatientCandidate,
      matchedLaineAppointmentTypeId: this.matchedLaineAppointmentTypeId,
      matchedNexhealthAppointmentTypeId: this.matchedNexhealthAppointmentTypeId,
      matchedAppointmentName: this.matchedAppointmentName,
      matchedAppointmentDuration: this.matchedAppointmentDuration,
      targetNexhealthProviderId: this.targetNexhealthProviderId,
      requestedDate: this.requestedDate,
      requestedTimePreference: this.requestedTimePreference,
      availableSlotsForDate: this.availableSlotsForDate,
      presentedSlots: this.presentedSlots,
      newPatientData: this.newPatientData,
      newPatientDataConfirmed: this.newPatientDataConfirmed,
      nexhealthPatientId: this.nexhealthPatientId,
      // Legacy properties for tool compatibility
      selectedTimeSlot: this.selectedTimeSlot,
      callSummaryForNote: this.callSummaryForNote,
      bookingDetailsPresentedForConfirmation: this.bookingDetailsPresentedForConfirmation,
      bookedAppointmentDetails: this.bookedAppointmentDetails,
      patientStatus: this.patientStatus,
      newPatientInfo: this.newPatientInfo,
      newPatientInfoConfirmation: this.newPatientInfoConfirmation,
    };
  }

  /**
   * Restores conversation state from a snapshot object.
   * @param snapshot - A snapshot object previously created with getStateSnapshot() or received from VAPI.
   */
  public restoreFromSnapshot(snapshot: Record<string, any>): void { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log('[ConversationState] Attempting to restore from snapshot:', snapshot);
    
    // Restore only the properties defined in this simplified class
    this.currentStage = typeof snapshot.currentStage === 'string' ? snapshot.currentStage : 'initial';
    this.initialUserUtterances = Array.isArray(snapshot.initialUserUtterances) ? snapshot.initialUserUtterances : null;
    this.determinedIntent = typeof snapshot.determinedIntent === 'string' ? snapshot.determinedIntent : null;
    this.reasonForVisit = typeof snapshot.reasonForVisit === 'string' ? snapshot.reasonForVisit : null;
    this.isNewPatientCandidate = typeof snapshot.isNewPatientCandidate === 'boolean' ? snapshot.isNewPatientCandidate : null;
    
    this.matchedLaineAppointmentTypeId = typeof snapshot.matchedLaineAppointmentTypeId === 'string' ? snapshot.matchedLaineAppointmentTypeId : null;
    this.matchedNexhealthAppointmentTypeId = typeof snapshot.matchedNexhealthAppointmentTypeId === 'string' ? snapshot.matchedNexhealthAppointmentTypeId : null;
    this.matchedAppointmentName = typeof snapshot.matchedAppointmentName === 'string' ? snapshot.matchedAppointmentName : null;
    this.matchedAppointmentDuration = typeof snapshot.matchedAppointmentDuration === 'number' ? snapshot.matchedAppointmentDuration : null;
    this.targetNexhealthProviderId = typeof snapshot.targetNexhealthProviderId === 'string' ? snapshot.targetNexhealthProviderId : null;

    this.requestedDate = typeof snapshot.requestedDate === 'string' ? snapshot.requestedDate : null;
    this.requestedTimePreference = snapshot.requestedTimePreference || null;
    this.availableSlotsForDate = Array.isArray(snapshot.availableSlotsForDate) ? snapshot.availableSlotsForDate : null;
    this.presentedSlots = Array.isArray(snapshot.presentedSlots) ? snapshot.presentedSlots : null;

    this.newPatientData = typeof snapshot.newPatientData === 'object' && snapshot.newPatientData !== null ? snapshot.newPatientData : {};
    this.newPatientDataConfirmed = typeof snapshot.newPatientDataConfirmed === 'boolean' ? snapshot.newPatientDataConfirmed : false;
    this.nexhealthPatientId = typeof snapshot.nexhealthPatientId === 'string' ? snapshot.nexhealthPatientId : null;
    
    // Restore legacy properties for tool compatibility
    this.selectedTimeSlot = typeof snapshot.selectedTimeSlot === 'object' && snapshot.selectedTimeSlot !== null ? snapshot.selectedTimeSlot : null;
    this.callSummaryForNote = typeof snapshot.callSummaryForNote === 'string' ? snapshot.callSummaryForNote : undefined;
    this.bookingDetailsPresentedForConfirmation = typeof snapshot.bookingDetailsPresentedForConfirmation === 'boolean' ? snapshot.bookingDetailsPresentedForConfirmation : false;
    this.bookedAppointmentDetails = typeof snapshot.bookedAppointmentDetails === 'object' && snapshot.bookedAppointmentDetails !== null ? snapshot.bookedAppointmentDetails : null;
    this.patientStatus = (snapshot.patientStatus === 'new' || snapshot.patientStatus === 'existing' || snapshot.patientStatus === 'unknown') ? snapshot.patientStatus : 'unknown';
    this.newPatientInfo = typeof snapshot.newPatientInfo === 'object' && snapshot.newPatientInfo !== null ? snapshot.newPatientInfo : {};
    this.newPatientInfoConfirmation = typeof snapshot.newPatientInfoConfirmation === 'object' && snapshot.newPatientInfoConfirmation !== null ? snapshot.newPatientInfoConfirmation : {};
    
    // Immutable properties (vapiCallId, practiceId, assistantId) are set in constructor and not restored.
    // If snapshot has different IDs, it might indicate a mismatched state, but we prioritize constructor values.
    if (snapshot.vapiCallId && snapshot.vapiCallId !== this.vapiCallId) {
        console.warn(`[ConversationState] Snapshot vapiCallId (${snapshot.vapiCallId}) differs from constructor (${this.vapiCallId}). Using constructor value.`);
    }

    console.log('[ConversationState] Restored state:', this.getStateSnapshot());
  }

  // Example simple setters (add more as needed for each property)
  public setInitialUserUtterances(utterances: string[]): void {
    this.initialUserUtterances = utterances;
    console.log(`[ConversationState] Updated initialUserUtterances:`, this.initialUserUtterances);
  }

  public setDeterminedIntent(intent: string | null): void {
    this.determinedIntent = intent;
    console.log(`[ConversationState] Updated determinedIntent: ${this.determinedIntent}`);
  }
  
  public setCurrentStage(stage: string): void {
    this.currentStage = stage;
    console.log(`[ConversationState] Updated currentStage: ${this.currentStage}`);
  }

  // Additional setters for compatibility with existing tools (will be cleaned up in later phases)
  public setReasonForVisit(reason: string | null): void {
    this.reasonForVisit = reason;
    console.log(`[ConversationState] Updated reasonForVisit: ${this.reasonForVisit}`);
  }

  public setIsNewPatientCandidate(isNew: boolean | null): void {
    this.isNewPatientCandidate = isNew;
    console.log(`[ConversationState] Updated isNewPatientCandidate: ${this.isNewPatientCandidate}`);
  }

  public updateNewPatientData(data: Partial<NewPatientData>): void {
    this.newPatientData = {...this.newPatientData, ...data};
    console.log(`[ConversationState] Updated newPatientData:`, this.newPatientData);
  }

  public setNewPatientDataConfirmed(confirmed: boolean): void {
    this.newPatientDataConfirmed = confirmed;
    console.log(`[ConversationState] Updated newPatientDataConfirmed: ${this.newPatientDataConfirmed}`);
  }

  public setNexhealthPatientId(id: string | null): void {
    this.nexhealthPatientId = id;
    console.log(`[ConversationState] Updated nexhealthPatientId: ${this.nexhealthPatientId}`);
  }

  public setMatchedLaineAppointmentTypeId(id: string | null): void {
    this.matchedLaineAppointmentTypeId = id;
    console.log(`[ConversationState] Updated matchedLaineAppointmentTypeId: ${this.matchedLaineAppointmentTypeId}`);
  }

  public setMatchedNexhealthAppointmentTypeId(id: string | null): void {
    this.matchedNexhealthAppointmentTypeId = id;
    console.log(`[ConversationState] Updated matchedNexhealthAppointmentTypeId: ${this.matchedNexhealthAppointmentTypeId}`);
  }

  public setMatchedAppointmentName(name: string | null): void {
    this.matchedAppointmentName = name;
    console.log(`[ConversationState] Updated matchedAppointmentName: ${this.matchedAppointmentName}`);
  }

  public setMatchedAppointmentDuration(duration: number | null): void {
    this.matchedAppointmentDuration = duration;
    console.log(`[ConversationState] Updated matchedAppointmentDuration: ${this.matchedAppointmentDuration}`);
  }

  public setTargetNexhealthProviderId(id: string | null): void {
    this.targetNexhealthProviderId = id;
    console.log(`[ConversationState] Updated targetNexhealthProviderId: ${this.targetNexhealthProviderId}`);
  }

  public setRequestedDate(date: string | null): void {
    this.requestedDate = date;
    console.log(`[ConversationState] Updated requestedDate: ${this.requestedDate}`);
  }

  public setRequestedTimePreference(preference: 'morning' | 'afternoon' | 'evening' | null): void {
    this.requestedTimePreference = preference;
    console.log(`[ConversationState] Updated requestedTimePreference: ${this.requestedTimePreference}`);
  }

  public setAvailableSlotsForDate(slots: NexHealthSlot[] | null): void {
    this.availableSlotsForDate = slots;
    console.log(`[ConversationState] Updated availableSlotsForDate:`, slots ? `${slots.length} slots` : 'null');
  }

  public setPresentedSlots(slots: string[] | null): void {
    this.presentedSlots = slots;
    console.log(`[ConversationState] Updated presentedSlots:`, slots);
  }

  // Compatibility methods for existing tools (temporary, will be removed in later phases)
  public updateIntent(intent: string): void {
    this.determinedIntent = intent;
    console.log(`[ConversationState] Updated determinedIntent: ${this.determinedIntent}`);
  }

  public updateReasonForVisit(reason: string): void {
    this.reasonForVisit = reason;
    console.log(`[ConversationState] Updated reasonForVisit: ${this.reasonForVisit}`);
  }

  public updateAppointmentType(typeId: string, name: string, duration: number): void {
    this.matchedLaineAppointmentTypeId = typeId;
    this.matchedAppointmentName = name;
    this.matchedAppointmentDuration = duration;
    console.log(`[ConversationState] Updated appointment type:`, { typeId, name, duration });
  }

  // Legacy properties for backward compatibility (will be removed in later phases)
  public get identifiedPatientId(): string | null {
    return this.nexhealthPatientId;
  }

  public get determinedAppointmentTypeId(): string | null {
    return this.matchedLaineAppointmentTypeId;
  }

  public get determinedAppointmentTypeName(): string | null {
    return this.matchedAppointmentName;
  }

  public get determinedDurationMinutes(): number | null {
    return this.matchedAppointmentDuration;
  }

  public get intent(): string | null {
    return this.determinedIntent;
  }

  // Additional legacy properties that tools expect (temporary compatibility)
  public selectedTimeSlot: Record<string, unknown> | null = null;
  public callSummaryForNote: string | undefined = undefined;
  public bookingDetailsPresentedForConfirmation: boolean = false;
  public bookedAppointmentDetails: Record<string, unknown> | null = null;
  public patientStatus: 'new' | 'existing' | 'unknown' = 'unknown';
  public newPatientInfo: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  public newPatientInfoConfirmation: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

  // Legacy methods for tool compatibility
  public updatePatient(patientId: string): void {
    this.nexhealthPatientId = patientId;
    console.log(`[ConversationState] Updated patient ID: ${patientId}`);
  }

  public updatePatientStatus(status: 'new' | 'existing'): void {
    this.patientStatus = status;
    console.log(`[ConversationState] Updated patientStatus: ${this.patientStatus}`);
  }

  public updateRequestedDate(date: string): void {
    this.requestedDate = date;
    console.log(`[ConversationState] Updated requestedDate: ${this.requestedDate}`);
  }

  public updateSelectedTimeSlot(slot: Record<string, unknown> | null): void {
    this.selectedTimeSlot = slot;
    console.log(`[ConversationState] Updated selectedTimeSlot:`, this.selectedTimeSlot);
  }

  public updateAvailableSlotsForDate(slots: unknown[]): void {
    this.availableSlotsForDate = slots as NexHealthSlot[];
    console.log(`[ConversationState] Updated availableSlotsForDate:`, this.availableSlotsForDate);
  }

  public updateNewPatientDetail(field: string, value: string | null, isConfirmed: boolean = false): void {
    (this.newPatientInfo as any)[field] = value; // eslint-disable-line @typescript-eslint/no-explicit-any
    (this.newPatientInfoConfirmation as any)[field] = isConfirmed; // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log(`[ConversationState] Updated newPatientDetail:`, { field, value, isConfirmed });
  }

  public updateBookingDetailsPresentedForConfirmation(status: boolean): void {
    this.bookingDetailsPresentedForConfirmation = status;
    console.log(`[ConversationState] Updated bookingDetailsPresentedForConfirmation: ${this.bookingDetailsPresentedForConfirmation}`);
  }

  public updateBookedAppointmentDetails(details: Record<string, unknown> | null): void {
    this.bookedAppointmentDetails = details;
    console.log(`[ConversationState] Updated booked appointment details:`, details);
  }
} 