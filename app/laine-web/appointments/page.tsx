"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WebBooking {
  id: string;
  patientFirstName: string;
  patientLastName: string;
  patientEmail: string;
  patientPhone: string;
  selectedSlotTime: string;
  appointmentType: {
    name: string;
  };
  createdAt: string;
}

interface AppointmentsResponse {
  success: boolean;
  bookings: WebBooking[];
}

export default function AppointmentsPage() {
  const { isLoaded, userId } = useAuth();
  const [bookings, setBookings] = useState<WebBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  if (isLoaded && !userId) {
    redirect('/sign-in');
  }

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch('/api/laine-web/appointments');
        
        if (!response.ok) {
          throw new Error('Failed to fetch appointments');
        }

        const data: AppointmentsResponse = await response.json();
        setBookings(data.bookings);

      } catch (error) {
        console.error('Error fetching appointments:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load appointments';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) {
      fetchAppointments();
    }
  }, [userId]);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatCreatedAt = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (!isLoaded || isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <p className="text-lg font-medium">Error Loading Appointments</p>
              <p className="text-sm mt-2">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            Laine Web Appointments
          </CardTitle>
          <p className="text-muted-foreground">
            View all appointments booked through your Laine Web scheduler
          </p>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No appointments have been booked through Laine Web yet.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Appointment Type</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Booked On</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-medium">
                        {booking.patientFirstName} {booking.patientLastName}
                      </TableCell>
                      <TableCell>
                        {booking.appointmentType.name}
                      </TableCell>
                      <TableCell>
                        {formatDateTime(booking.selectedSlotTime)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{booking.patientEmail}</div>
                          <div className="text-muted-foreground">
                            {booking.patientPhone}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatCreatedAt(booking.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 