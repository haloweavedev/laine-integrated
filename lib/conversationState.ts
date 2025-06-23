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
  
  // New patient information collection
  public collectedInfoForNewPatient: Record<string, string> | null = null; // e.g., { firstName, lastName, dob, phone, email }
  
  // Call summary and booking context
  public callSummaryForNote: string | undefined = undefined;
  public bookedAppointmentDetails: Record<string, unknown> | null = null;
  public practiceDetails: Record<string, unknown> | null = null;

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
  }

  /**
   * Updates the requested date for appointments
   * @param date - The requested date in YYYY-MM-DD format
   */
  updateRequestedDate(date: string): void {
    this.requestedDate = date;
  }

  /**
   * Updates the selected time slot details
   * @param slot - The slot details object
   */
  updateSelectedSlot(slot: Record<string, unknown>): void {
    this.selectedTimeSlot = slot;
  }

  /**
   * Updates new patient information incrementally
   * @param field - The field name (firstName, lastName, dob, phone, email, etc.)
   * @param value - The field value
   */
  updateNewPatientInfo(field: string, value: string): void {
    if (!this.collectedInfoForNewPatient) {
      this.collectedInfoForNewPatient = {};
    }
    this.collectedInfoForNewPatient[field] = value;
  }

  /**
   * Clears all collected new patient information
   */
  clearNewPatientInfo(): void {
    this.collectedInfoForNewPatient = null;
  }

  /**
   * Sets the call summary for appointment notes
   * @param summary - The call summary text
   */
  setCallSummary(summary: string): void {
    this.callSummaryForNote = summary;
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
      determinedAppointmentTypeId: this.determinedAppointmentTypeId,
      determinedAppointmentTypeName: this.determinedAppointmentTypeName,
      determinedDurationMinutes: this.determinedDurationMinutes,
      requestedDate: this.requestedDate,
      selectedTimeSlot: this.selectedTimeSlot,
      availableSlotsForDate: this.availableSlotsForDate,
      lastUserIntent: this.lastUserIntent,
      collectedInfoForNewPatient: this.collectedInfoForNewPatient,
      callSummaryForNote: this.callSummaryForNote,
      bookedAppointmentDetails: this.bookedAppointmentDetails,
      practiceDetails: this.practiceDetails
    };
  }
} 