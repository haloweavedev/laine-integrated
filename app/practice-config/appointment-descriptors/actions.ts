"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getNexhealthBearerToken } from "@/lib/nexhealth";

interface NexHealthAppointmentDescriptor {
  id: number;
  name: string;
  code: string;
  descriptor_type: string;
}

interface NexHealthAppointmentDescriptorsResponse {
  data: NexHealthAppointmentDescriptor[];
}

interface LocalAppointmentType {
  id: string;
  nexhealthAppointmentTypeId: string;
  name: string;
  duration: number;
  bookableOnline: boolean | null;
}

interface GetAppointmentDescriptorsResult {
  success: boolean;
  error?: string;
  data?: {
    descriptors: NexHealthAppointmentDescriptor[];
    localAppointmentTypes: LocalAppointmentType[];
    practiceId: string;
  };
}

export async function getAppointmentDescriptorsAction(): Promise<GetAppointmentDescriptorsResult> {
  try {
    // Get authenticated user
    const { userId } = await auth();
    if (!userId) {
      return {
        success: false,
        error: "Unauthorized - please sign in"
      };
    }

    // Fetch practice data
    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId },
      select: {
        id: true,
        nexhealthLocationId: true,
        nexhealthSubdomain: true
      }
    });

    if (!practice) {
      return {
        success: false,
        error: "Practice not found - please configure your practice first"
      };
    }

    if (!practice.nexhealthLocationId || !practice.nexhealthSubdomain) {
      return {
        success: false,
        error: "NexHealth location ID or subdomain not configured - please complete your practice setup"
      };
    }

    // Get NexHealth bearer token
    const bearerToken = await getNexhealthBearerToken();

    // Construct URL for appointment descriptors
    const url = `https://nexhealth.info/locations/${practice.nexhealthLocationId}/appointment_descriptors`;

    // Make API call to NexHealth
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.Nexhealth+json;version=2',
        'Authorization': `Bearer ${bearerToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`NexHealth API error (${response.status}):`, errorText);
      return {
        success: false,
        error: `Failed to fetch appointment descriptors from NexHealth: ${response.status} - ${errorText}`
      };
    }

    const nexhealthResponse: NexHealthAppointmentDescriptorsResponse = await response.json();

    // Fetch local appointment types for this practice
    const localAppointmentTypes = await prisma.appointmentType.findMany({
      where: { practiceId: practice.id },
      select: {
        id: true,
        nexhealthAppointmentTypeId: true,
        name: true,
        duration: true,
        bookableOnline: true
      }
    });

    return {
      success: true,
      data: {
        descriptors: nexhealthResponse.data || [],
        localAppointmentTypes,
        practiceId: practice.id
      }
    };

  } catch (error) {
    console.error('Error in getAppointmentDescriptorsAction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
} 