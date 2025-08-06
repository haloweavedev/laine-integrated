"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// Progressive form steps
type FormStep = 'patient-type' | 'appointment-for' | 'guardian-check' | 'patient-details';



// Combined form data
interface PatientFormData {
  patientType: 'NEW' | 'EXISTING';
  isForSelf: boolean;
  isGuardian?: boolean;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dob?: string;
  insurance?: string;
  notes?: string;
  nexhealthPatientId?: number; // Added after patient lookup/creation
}

interface SelectedSlot {
  time: string;
  end_time: string;
  operatory_id: number;
  pid: number; // provider id from NexHealth
  lid: number; // location id from NexHealth
}

interface PatientDetailsStepProps {
  practiceId: string;
  selectedSlot: SelectedSlot;
  onSubmit: (details: PatientFormData) => void;
}

interface FoundPatient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  name: string;
  phone: string;
  dateOfBirth: string;
  isNewPatient: boolean;
}

export function PatientDetailsStep({ practiceId, selectedSlot, onSubmit }: PatientDetailsStepProps) {
  const [currentStep, setCurrentStep] = useState<FormStep>('patient-type');
  const [formData, setFormData] = useState<Partial<PatientFormData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundPatients, setFoundPatients] = useState<FoundPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm({
    mode: 'onChange'
  });

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setValue('phone', formatted);
  };

  // Handle patient lookup
  const handlePatientLookup = async (firstName: string, lastName: string, dob?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/laine-web/patient', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          practiceId,
          firstName,
          lastName,
          dob,
          type: 'lookup'
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to search for patient');
      }

      setFoundPatients(data.patients || []);
      
      if (data.patients && data.patients.length > 0) {
        // If exact match found, auto-select
        if (data.patients.length === 1) {
          setSelectedPatientId(data.patients[0].id);
        }
      } else {
        setError('No matching patients found. Please verify the name and date of birth.');
      }
    } catch (err) {
      console.error('Patient lookup error:', err);
      setError(err instanceof Error ? err.message : 'Failed to search for patient');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle patient creation
  const handlePatientCreation = async (patientData: PatientFormData, providerId: number) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/laine-web/patient', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          practiceId,
          firstName: patientData.firstName,
          lastName: patientData.lastName,
          email: patientData.email,
          phone: patientData.phone,
          dob: patientData.dob,
          type: 'create',
          providerId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create patient');
      }

      // Patient created successfully, proceed with booking
      const finalFormData: PatientFormData = {
        ...formData,
        ...patientData,
        nexhealthPatientId: data.patient.id
      } as PatientFormData;

      onSubmit(finalFormData);
    } catch (err) {
      console.error('Patient creation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create patient');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Patient Type Selection
  const renderPatientTypeStep = () => (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Are you a new or existing patient?</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
          onValueChange={(value) => {
            const patientType = value as 'NEW' | 'EXISTING';
            setFormData(prev => ({ ...prev, patientType }));
            setCurrentStep('appointment-for');
          }}
              className="flex flex-col space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="NEW" id="new-patient" />
                <Label htmlFor="new-patient">I&apos;m a new patient (first time at this practice)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="EXISTING" id="existing-patient" />
                <Label htmlFor="existing-patient">I&apos;m an existing patient (I&apos;ve been here before)</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
  );

  // Step 2: Who is appointment for
  const renderAppointmentForStep = () => (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Who is this appointment for?</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
          onValueChange={(value) => {
            const isForSelf = value === 'self';
            setFormData(prev => ({ ...prev, isForSelf }));
            
            // If it's for someone else, go to guardian check
            if (!isForSelf) {
              setCurrentStep('guardian-check');
            } else {
              setCurrentStep('patient-details');
            }
          }}
              className="flex flex-col space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="self" id="self" />
                <Label htmlFor="self">For myself</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other">For someone else</Label>
              </div>
            </RadioGroup>
        
        <div className="mt-4">
          <Button 
            variant="outline" 
            onClick={() => setCurrentStep('patient-type')}
          >
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Step 3: Guardian Check (only if appointment is for someone else)
  const renderGuardianCheckStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Guardian Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-gray-600">
            Since you&apos;re booking for someone else, please confirm:
          </p>
          
          <RadioGroup
            onValueChange={(value) => {
              const isGuardian = value === 'yes';
              setFormData(prev => ({ ...prev, isGuardian }));
              setCurrentStep('patient-details');
            }}
            className="flex flex-col space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="guardian-yes" />
              <Label htmlFor="guardian-yes">Yes, I am the parent or legal guardian of the patient</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="guardian-no" />
              <Label htmlFor="guardian-no">No, I am booking on behalf of the patient (with their permission)</Label>
            </div>
          </RadioGroup>
          
          <div className="mt-4">
            <Button 
              variant="outline" 
              onClick={() => setCurrentStep('appointment-for')}
            >
              Back
            </Button>
          </div>
        </div>
          </CardContent>
        </Card>
  );

  // Step 4: Patient Details Form
  const renderPatientDetailsStep = () => {
    const isNewPatient = formData.patientType === 'NEW';
    const isForSelf = formData.isForSelf;
    
    const onSubmitDetails = async (data: Record<string, unknown>) => {
      const patientData: PatientFormData = {
        patientType: formData.patientType || 'NEW',
        isForSelf: formData.isForSelf || true,
        isGuardian: formData.isGuardian,
        firstName: data.firstName as string,
        lastName: data.lastName as string,
        email: data.email as string,
        phone: data.phone as string,
        dob: data.dob as string,
        insurance: data.insurance as string,
        notes: data.notes as string
      };

      if (isNewPatient) {
        // For new patients, we need to create them in NexHealth
        await handlePatientCreation(patientData, selectedSlot.pid);
      } else {
        // For existing patients, lookup first
        await handlePatientLookup(data.firstName as string, data.lastName as string, data.dob as string);
      }
    };

    return (
      <form onSubmit={handleSubmit(onSubmitDetails)} className="space-y-6">
        {/* Patient Details Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {isNewPatient ? 'New Patient Information' : 'Patient Lookup Information'}
            </CardTitle>
            <p className="text-sm text-gray-600">
              {isNewPatient 
                ? 'Please provide the patient details to create a new record.'
                : 'Please provide the patient details to find their existing record.'
              }
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">
                  First Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="firstName"
                  {...register('firstName', { required: 'First name is required' })}
                  className={errors.firstName ? 'border-red-500' : ''}
                />
                {errors.firstName && (
                  <p className="text-red-500 text-sm mt-1">{errors.firstName.message as string}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="lastName">
                  Last Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lastName"
                  {...register('lastName', { required: 'Last name is required' })}
                  className={errors.lastName ? 'border-red-500' : ''}
                />
                {errors.lastName && (
                  <p className="text-red-500 text-sm mt-1">{errors.lastName.message as string}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="dob">
                Date of Birth <span className="text-red-500">*</span>
                {!isNewPatient && (
                  <span className="text-sm text-gray-500 ml-2">(required for patient lookup)</span>
                )}
              </Label>
              <Input
                id="dob"
                type="date"
                {...register('dob', { required: 'Date of birth is required' })}
                className={errors.dob ? 'border-red-500' : ''}
              />
              {errors.dob && (
                <p className="text-red-500 text-sm mt-1">{errors.dob.message as string}</p>
              )}
            </div>

            {isNewPatient && (
              <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">
                  Email Address <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                      {...register('email', { 
                        required: 'Email is required for new patients',
                        pattern: {
                          value: /^\S+@\S+$/,
                          message: 'Please enter a valid email address'
                        }
                      })}
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && (
                      <p className="text-red-500 text-sm mt-1">{errors.email.message as string}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="phone">
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phone"
                      {...register('phone', { required: 'Phone number is required for new patients' })}
                  onChange={handlePhoneChange}
                  placeholder="(555) 123-4567"
                  className={errors.phone ? 'border-red-500' : ''}
                />
                {errors.phone && (
                      <p className="text-red-500 text-sm mt-1">{errors.phone.message as string}</p>
                )}
              </div>
            </div>

                {isForSelf && (
              <div>
                <Label htmlFor="insurance">Insurance Provider (Optional)</Label>
                <Input
                  id="insurance"
                  {...register('insurance')}
                  placeholder="e.g., Blue Cross Blue Shield, Delta Dental"
                />
              </div>
                )}
              </>
            )}

            <div>
              <Label htmlFor="notes">Notes or Special Requests (Optional)</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                placeholder="Any additional information you'd like to share..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Show found patients for existing patient lookup */}
        {!isNewPatient && foundPatients.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Found Patients</CardTitle>
              <p className="text-sm text-gray-600">
                Please select the correct patient from the list below:
              </p>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={selectedPatientId?.toString()}
                onValueChange={(value) => setSelectedPatientId(parseInt(value))}
                className="space-y-3"
              >
                {foundPatients.map((patient) => (
                  <div key={patient.id} className="flex items-start space-x-2">
                    <RadioGroupItem value={patient.id.toString()} id={`patient-${patient.id}`} className="mt-1" />
                    <Label htmlFor={`patient-${patient.id}`} className="flex-1 cursor-pointer">
                      <div className="border rounded-lg p-3 hover:bg-gray-50">
                        <div className="font-medium">{patient.name}</div>
                        <div className="text-sm text-gray-600">
                          DOB: {patient.dateOfBirth} | Phone: {patient.phone}
                        </div>
                        <div className="text-sm text-gray-600">
                          Email: {patient.email}
                        </div>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <p className="text-red-600">{error}</p>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between">
          <Button 
            type="button"
            variant="outline" 
            onClick={() => {
              if (formData.isForSelf) {
                setCurrentStep('appointment-for');
              } else {
                setCurrentStep('guardian-check');
              }
            }}
          >
            Back
          </Button>
          
          <Button
            type="submit"
            disabled={isLoading || (!isNewPatient && foundPatients.length > 0 && !selectedPatientId)}
          >
            {isLoading ? 'Processing...' : (isNewPatient ? 'Create Patient & Continue' : 'Lookup Patient')}
          </Button>
        </div>

        {/* Final submit for existing patients */}
        {!isNewPatient && selectedPatientId && (
          <div className="flex justify-center">
            <Button
              type="button"
              onClick={() => {
                const selectedPatient = foundPatients.find(p => p.id === selectedPatientId);
                if (selectedPatient) {
                  const finalFormData: PatientFormData = {
                    ...formData,
                    firstName: selectedPatient.firstName,
                    lastName: selectedPatient.lastName,
                    email: selectedPatient.email,
                    phone: selectedPatient.phone,
                    dob: selectedPatient.dateOfBirth,
                    nexhealthPatientId: selectedPatient.id
                  } as PatientFormData;
                  
                  onSubmit(finalFormData);
                }
              }}
              className="px-8 py-2"
            >
              Continue to Confirmation
            </Button>
          </div>
        )}
      </form>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Patient Information
        </h2>
        <p className="text-gray-600">
          Please provide the details for the appointment.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex justify-center">
        <div className="flex items-center space-x-2 text-sm">
          <div className={`w-3 h-3 rounded-full ${currentStep === 'patient-type' ? 'bg-blue-500' : 'bg-gray-300'}`} />
          <div className={`w-3 h-3 rounded-full ${currentStep === 'appointment-for' ? 'bg-blue-500' : 'bg-gray-300'}`} />
          {!formData.isForSelf && (
            <div className={`w-3 h-3 rounded-full ${currentStep === 'guardian-check' ? 'bg-blue-500' : 'bg-gray-300'}`} />
          )}
          <div className={`w-3 h-3 rounded-full ${currentStep === 'patient-details' ? 'bg-blue-500' : 'bg-gray-300'}`} />
        </div>
      </div>

      {/* Render current step */}
      {currentStep === 'patient-type' && renderPatientTypeStep()}
      {currentStep === 'appointment-for' && renderAppointmentForStep()}
      {currentStep === 'guardian-check' && renderGuardianCheckStep()}
      {currentStep === 'patient-details' && renderPatientDetailsStep()}
    </div>
  );
}