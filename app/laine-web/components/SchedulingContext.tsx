"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Practice {
  id: string;
  name: string | null;
  slug: string;
  timezone: string | null;
  nexhealthSubdomain: string;
  nexhealthLocationId: string;
}

interface Patient {
  firstName: string;
  lastName: string;
  status: 'NEW' | 'RETURNING';
}

interface AppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
  spokenName: string | null;
}

interface ContactInfo {
  email: string;
  phone: string;
  dob: string;
  notes: string;
}

interface SelectedSlot {
  time: string;
  operatory_id?: number;
  providerId: number;
  locationId: number;
}

interface SchedulingState {
  practice: Practice | null;
  step: number;
  patient: Patient;
  appointmentType: AppointmentType | null;
  selectedDate: string | null;
  selectedSlot: SelectedSlot | null;
  contactInfo: ContactInfo;
  isLoading: boolean;
  error: string | null;
}

interface SchedulingContextType {
  state: SchedulingState;
  setPatientDetails: (patient: Patient) => void;
  selectAppointmentType: (appointmentType: AppointmentType) => void;
  selectDate: (date: string) => void;
  selectSlot: (slot: SelectedSlot) => void;
  setContactInfo: (contactInfo: Partial<ContactInfo>) => void;
  nextStep: () => void;
  prevStep: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  resetState: () => void;
}

const SchedulingContext = createContext<SchedulingContextType | undefined>(undefined);

const initialState: SchedulingState = {
  practice: null,
  step: 1,
  patient: {
    firstName: '',
    lastName: '',
    status: 'NEW'
  },
  appointmentType: null,
  selectedDate: null,
  selectedSlot: null,
  contactInfo: {
    email: '',
    phone: '',
    dob: '',
    notes: ''
  },
  isLoading: false,
  error: null
};

interface SchedulingProviderProps {
  children: ReactNode;
  practice: Practice;
}

export function SchedulingProvider({ children, practice }: SchedulingProviderProps) {
  const [state, setState] = useState<SchedulingState>({
    ...initialState,
    practice
  });

  const setPatientDetails = (patient: Patient) => {
    setState(prev => ({
      ...prev,
      patient,
      error: null
    }));
  };

  const selectAppointmentType = (appointmentType: AppointmentType) => {
    setState(prev => ({
      ...prev,
      appointmentType,
      error: null
    }));
  };

  const selectDate = (date: string) => {
    setState(prev => ({
      ...prev,
      selectedDate: date,
      selectedSlot: null, // Reset slot when date changes
      error: null
    }));
  };

  const selectSlot = (slot: SelectedSlot) => {
    setState(prev => ({
      ...prev,
      selectedSlot: slot,
      error: null
    }));
  };

  const setContactInfo = (contactInfo: Partial<ContactInfo>) => {
    setState(prev => ({
      ...prev,
      contactInfo: {
        ...prev.contactInfo,
        ...contactInfo
      },
      error: null
    }));
  };

  const nextStep = () => {
    setState(prev => ({
      ...prev,
      step: Math.min(prev.step + 1, 5),
      error: null
    }));
  };

  const prevStep = () => {
    setState(prev => ({
      ...prev,
      step: Math.max(prev.step - 1, 1),
      error: null
    }));
  };

  const setLoading = (loading: boolean) => {
    setState(prev => ({
      ...prev,
      isLoading: loading
    }));
  };

  const setError = (error: string | null) => {
    setState(prev => ({
      ...prev,
      error,
      isLoading: false
    }));
  };

  const resetState = () => {
    setState({
      ...initialState,
      practice
    });
  };

  const contextValue: SchedulingContextType = {
    state,
    setPatientDetails,
    selectAppointmentType,
    selectDate,
    selectSlot,
    setContactInfo,
    nextStep,
    prevStep,
    setLoading,
    setError,
    resetState
  };

  return (
    <SchedulingContext.Provider value={contextValue}>
      {children}
    </SchedulingContext.Provider>
  );
}

export function useScheduling(): SchedulingContextType {
  const context = useContext(SchedulingContext);
  if (context === undefined) {
    throw new Error('useScheduling must be used within a SchedulingProvider');
  }
  return context;
} 