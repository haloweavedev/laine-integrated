"use client";


import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// Zod schema for form validation
const patientDetailsSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50, 'First name must be less than 50 characters'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name must be less than 50 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits').regex(/^[\d\s\-\(\)\+\.]+$/, 'Please enter a valid phone number'),
  dob: z.string().optional(),
  patientType: z.enum(['NEW', 'EXISTING']),
  patientStatus: z.enum(['NEW', 'RETURNING']),
  isForSelf: z.boolean(),
  isGuardian: z.boolean().optional(),
  insurance: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => {
  // If it's for someone else, dob is required
  if (!data.isForSelf && !data.dob) {
    return false;
  }
  // If existing patient, dob is required for patient lookup
  if (data.patientType === 'EXISTING' && !data.dob) {
    return false;
  }
  return true;
}, {
  message: "Date of birth is required when booking for someone else or for existing patients",
  path: ["dob"]
});

type PatientDetailsForm = z.infer<typeof patientDetailsSchema>;

interface PatientDetailsStepProps {
  onSubmit: (details: PatientDetailsForm) => void;
}

export function PatientDetailsStep({ onSubmit }: PatientDetailsStepProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<PatientDetailsForm>({
    resolver: zodResolver(patientDetailsSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dob: '',
      patientType: 'NEW',
      patientStatus: 'NEW',
      isForSelf: true,
      isGuardian: false,
      insurance: '',
      notes: ''
    },
    mode: 'onChange'
  });

  const watchedIsForSelf = watch('isForSelf');
  const watchedPatientType = watch('patientType');
  const watchedPatientStatus = watch('patientStatus');

  const handleForSelfChange = (value: string) => {
    const forSelf = value === 'self';
    setValue('isForSelf', forSelf);
    
    // Reset dependent fields when switching
    if (forSelf) {
      setValue('isGuardian', false);
      setValue('dob', '');
    } else {
      setValue('insurance', '');
    }
  };

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Patient Type Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Are you a new or existing patient?</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={watchedPatientType}
              onValueChange={(value) => setValue('patientType', value as 'NEW' | 'EXISTING')}
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

        {/* Who is this appointment for? */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Who is this appointment for?</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={watchedIsForSelf ? 'self' : 'other'}
              onValueChange={handleForSelfChange}
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
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">
                  First Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="firstName"
                  {...register('firstName')}
                  className={errors.firstName ? 'border-red-500' : ''}
                />
                {errors.firstName && (
                  <p className="text-red-500 text-sm mt-1">{errors.firstName.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="lastName">
                  Last Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lastName"
                  {...register('lastName')}
                  className={errors.lastName ? 'border-red-500' : ''}
                />
                {errors.lastName && (
                  <p className="text-red-500 text-sm mt-1">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">
                  Email Address <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="phone">
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phone"
                  {...register('phone')}
                  onChange={handlePhoneChange}
                  placeholder="(555) 123-4567"
                  className={errors.phone ? 'border-red-500' : ''}
                />
                {errors.phone && (
                  <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>
                )}
              </div>
            </div>

            {(!watchedIsForSelf || watchedPatientType === 'EXISTING') && (
              <div>
                <Label htmlFor="dob">
                  Date of Birth <span className="text-red-500">*</span>
                  {watchedPatientType === 'EXISTING' && (
                    <span className="text-sm text-gray-500 ml-2">(required for patient lookup)</span>
                  )}
                </Label>
                <Input
                  id="dob"
                  type="date"
                  {...register('dob')}
                  className={errors.dob ? 'border-red-500' : ''}
                />
                {errors.dob && (
                  <p className="text-red-500 text-sm mt-1">{errors.dob.message}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Patient Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Patient Status</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={watchedPatientStatus}
              onValueChange={(value) => setValue('patientStatus', value as 'NEW' | 'RETURNING')}
              className="flex flex-col space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="NEW" id="new" />
                <Label htmlFor="new">New patient (first time visiting this practice)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="RETURNING" id="returning" />
                <Label htmlFor="returning">Returning patient</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Conditional Fields */}
        {!watchedIsForSelf && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Guardian Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isGuardian"
                  {...register('isGuardian')}
                  onCheckedChange={(checked) => setValue('isGuardian', !!checked)}
                />
                <Label htmlFor="isGuardian">
                  I am the parent or legal guardian of this patient
                </Label>
              </div>
            </CardContent>
          </Card>
        )}

        {watchedIsForSelf && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Insurance Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="insurance">Insurance Provider (Optional)</Label>
                <Input
                  id="insurance"
                  {...register('insurance')}
                  placeholder="e.g., Blue Cross Blue Shield, Delta Dental"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Additional Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Information</CardTitle>
          </CardHeader>
          <CardContent>
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

        {/* Submit Button */}
        <div className="flex justify-center">
          <Button
            type="submit"
            disabled={!isValid}
            className="px-8 py-2"
          >
            Continue to Confirmation
          </Button>
        </div>
      </form>
    </div>
  );
}