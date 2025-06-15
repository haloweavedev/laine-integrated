"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getNexhealthBearerToken } from "@/lib/nexhealth";

interface NexHealthProvider {
  id: number;
  email: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  name: string;
  created_at: string;
  updated_at: string;
  institution_id: number;
  foreign_id: string;
  foreign_id_type: string;
  bio: {
    phone_number: string;
    cell_phone_number: string;
    home_phone_number: string;
  };
  inactive: boolean;
  last_sync_time: string | null;
  display_name: string | null;
  npi: string | null;
  tin: string | null;
  state_license: string | null;
  specialty_code: string;
  nexhealth_specialty: string;
  profile_url: string;
  locations: Array<{
    id: number;
    name: string;
    institution_id: number;
    street_address: string;
    street_address_2: string;
    city: string;
    state: string | null;
    zip_code: string;
    phone_number: string;
    inactive: boolean;
  }>;
  provider_requestables: unknown[];
}

interface NexHealthProviderDetail extends NexHealthProvider {
  availabilities: Array<{
    id: number;
    provider_id: number;
    location_id: number;
    operatory_id: number;
    begin_time: string;
    end_time: string;
    days: string[];
    specific_date: string | null;
    custom_recurrence: unknown | null;
    tz_offset: string;
    active: boolean;
    synced: boolean;
    appointment_types: Array<{
      id: number;
      name: string;
      parent_type: string;
      parent_id: number;
      minutes: number;
      bookable_online: boolean;
    }>;
  }>;
}

interface GetProvidersResult {
  success: boolean;
  error?: string;
  data?: {
    providers: NexHealthProvider[];
    practiceId: string;
  };
}

interface GetProviderDetailResult {
  success: boolean;
  error?: string;
  data?: {
    provider: NexHealthProviderDetail;
    practiceId: string;
  };
}

export async function getProvidersAction(): Promise<GetProvidersResult> {
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

    // Construct URL for providers
    const url = `https://nexhealth.info/providers?subdomain=${practice.nexhealthSubdomain}&page=1&per_page=300&location_id=${practice.nexhealthLocationId}&inactive=false`;

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
        error: `Failed to fetch providers from NexHealth: ${response.status} - ${errorText}`
      };
    }

    const nexhealthResponse = await response.json();

    return {
      success: true,
      data: {
        providers: nexhealthResponse.data || [],
        practiceId: practice.id
      }
    };

  } catch (error) {
    console.error('Error in getProvidersAction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

export async function getProviderDetailAction(providerId: number): Promise<GetProviderDetailResult> {
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

    // Construct URL for provider details
    const url = `https://nexhealth.info/providers/${providerId}?subdomain=${practice.nexhealthSubdomain}&include[]=appointment_types&include[]=availabilities`;

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
        error: `Failed to fetch provider details from NexHealth: ${response.status} - ${errorText}`
      };
    }

    const nexhealthResponse = await response.json();

    return {
      success: true,
      data: {
        provider: nexhealthResponse.data,
        practiceId: practice.id
      }
    };

  } catch (error) {
    console.error('Error in getProviderDetailAction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
} 