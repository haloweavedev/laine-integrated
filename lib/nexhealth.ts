import { prisma } from "@/lib/prisma";
import { addSeconds } from 'date-fns';

interface NexHealthAppointmentType {
  id: number;
  name: string;
  minutes: number; // NexHealth uses 'minutes' not 'duration'
  parent_type: string;
  parent_id: number;
  bookable_online: boolean;
}

interface NexHealthProvider {
  id: number;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  inactive?: boolean;
  npi?: string;
  specialty_code?: string;
  nexhealth_specialty?: string;
}

interface NexHealthOperatory {
  id: number;
  name: string;
  location_id: number;
  active: boolean;
}

const NEXHEALTH_API_BASE_URL = process.env.NEXHEALTH_API_BASE_URL!;
const MASTER_NEXHEALTH_API_KEY = process.env.NEXHEALTH_API_KEY!; // The master key

const TOKEN_CACHE_ID = "singleton"; // Fixed ID for the single token entry
const TOKEN_EXPIRY_BUFFER_SECONDS = 300; // 5 minutes buffer
const DEFAULT_TOKEN_LIFETIME_SECONDS = 55 * 60; // 55 minutes (safe for 1-hour tokens)

async function fetchNewBearerToken(): Promise<{ accessToken: string; expiresAt: Date }> {
  if (!MASTER_NEXHEALTH_API_KEY) {
    throw new Error("NEXHEALTH_API_KEY is not configured in environment variables.");
  }

  const authUrl = `${NEXHEALTH_API_BASE_URL}/authenticates`;
  console.log("Fetching new NexHealth bearer token...");

  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.Nexhealth+json;version=2',
        // NexHealth expects the raw master key for /authenticates endpoint
        'Authorization': MASTER_NEXHEALTH_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Failed to fetch NexHealth bearer token:", response.status, errorBody);
      throw new Error(`NexHealth Authentication failed: ${response.status} - ${errorBody}`);
    }

    const result = await response.json();
    
    if (!result.data || !result.data.token) {
      console.error("NexHealth /authenticates response missing token:", result);
      throw new Error("Invalid token response from NexHealth /authenticates");
    }

    const accessToken = result.data.token;
    const now = new Date();
    
    // If NexHealth provides expiry in response, use it. Otherwise, use default lifetime.
    // Most JWT tokens have 1-hour validity, we use 55 minutes to be safe
    let expiresAt: Date;
    
    if (result.data.exp) {
      // If exp is provided as UNIX timestamp (seconds)
      expiresAt = new Date(result.data.exp * 1000);
    } else {
      // Default to 55 minutes from now
      expiresAt = addSeconds(now, DEFAULT_TOKEN_LIFETIME_SECONDS);
    }

    console.log(`New NexHealth token expires at: ${expiresAt.toISOString()}`);

    // Cache the token in database
    await prisma.nexhealthTokenCache.upsert({
      where: { id: TOKEN_CACHE_ID },
      update: { accessToken, expiresAt },
      create: { id: TOKEN_CACHE_ID, accessToken, expiresAt },
    });

    return { accessToken, expiresAt };
  } catch (error) {
    console.error('Error fetching NexHealth bearer token:', error);
    throw error;
  }
}

export async function getNexhealthBearerToken(): Promise<string> {
  try {
    // Check for cached token
    const cachedToken = await prisma.nexhealthTokenCache.findUnique({
      where: { id: TOKEN_CACHE_ID },
    });

    if (cachedToken) {
      const now = new Date();
      const tokenStillValidUntil = addSeconds(now, TOKEN_EXPIRY_BUFFER_SECONDS);
      
      if (cachedToken.expiresAt > tokenStillValidUntil) {
        console.log("Using cached NexHealth bearer token.");
        return cachedToken.accessToken;
      }
      console.log("Cached NexHealth token expired or nearing expiry.");
    } else {
      console.log("No cached NexHealth token found.");
    }

    // Fetch new token if none cached or expired
    const { accessToken } = await fetchNewBearerToken();
    return accessToken;
  } catch (error) {
    console.error('Error getting NexHealth bearer token:', error);
    throw error;
  }
}

// Export the generic API function for use in tools and other modules
export async function fetchNexhealthAPI(
  path: string, // e.g., "/appointment_types"
  subdomain: string, // Practice-specific subdomain
  params?: Record<string, string | number | string[]>,
  method: string = 'GET',
  body?: unknown
) {
  // Get valid bearer token
  const bearerToken = await getNexhealthBearerToken();
  
  const url = new URL(`${NEXHEALTH_API_BASE_URL}${path}`);
  
  // Add subdomain for data API calls (not for /authenticates)
  if (path !== '/authenticates' && !params?.subdomain) {
    url.searchParams.append('subdomain', subdomain);
  }
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => url.searchParams.append(key, v.toString()));
      } else {
        url.searchParams.append(key, value.toString());
      }
    });
  }

  const options: RequestInit = {
    method,
    headers: {
      'Accept': 'application/vnd.Nexhealth+json;version=2',
      'Authorization': `Bearer ${bearerToken}`, // Use bearer token for data APIs
      'Content-Type': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url.toString(), options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`NexHealth API error (${response.status}):`, errorText);
      
      // If we get 401, the token might be invalid - clear cache and retry once
      if (response.status === 401) {
        console.log("Got 401, clearing token cache and retrying...");
        await prisma.nexhealthTokenCache.deleteMany({
          where: { id: TOKEN_CACHE_ID }
        });
        
        // Retry with fresh token (recursive call - but only once due to cache clear)
        return fetchNexhealthAPI(path, subdomain, params, method, body);
      }
      
      throw new Error(`NexHealth API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('NexHealth API error:', error);
    throw error;
  }
}

export async function getAppointmentTypes(subdomain: string, locationId: string): Promise<NexHealthAppointmentType[]> {
  if (!subdomain || !locationId) throw new Error("Subdomain and Location ID are required.");
  
  const data = await fetchNexhealthAPI(
    '/appointment_types',
    subdomain,
    { location_id: locationId }
  );
  
  // Handle different possible response structures
  let appointmentTypes = null;
  
  if (Array.isArray(data)) {
    appointmentTypes = data;
  } else if (data?.data?.appointment_types && Array.isArray(data.data.appointment_types)) {
    appointmentTypes = data.data.appointment_types;
  } else if (data?.appointment_types && Array.isArray(data.appointment_types)) {
    appointmentTypes = data.appointment_types;
  } else if (data?.data && Array.isArray(data.data)) {
    appointmentTypes = data.data;
  } else {
    console.warn("Unexpected appointment_types response structure:", data);
    appointmentTypes = [];
  }
  return appointmentTypes;
}

export async function getProviders(subdomain: string, locationId: string): Promise<NexHealthProvider[]> {
  if (!subdomain || !locationId) throw new Error("Subdomain and Location ID are required.");
  
  const data = await fetchNexhealthAPI(
    '/providers',
    subdomain,
    { location_id: locationId, inactive: 'false', page: '1', per_page: '300' }
  );
  
  // Handle different possible response structures
  let providers = null;
  
  if (Array.isArray(data)) {
    providers = data;
  } else if (data?.data?.providers && Array.isArray(data.data.providers)) {
    providers = data.data.providers;
  } else if (data?.providers && Array.isArray(data.providers)) {
    providers = data.providers;
  } else if (data?.data && Array.isArray(data.data)) {
    providers = data.data;
  } else {
    console.warn("Unexpected providers response structure:", data);
    providers = [];
  }
  return providers;
}

export async function getOperatories(subdomain: string, locationId: string): Promise<NexHealthOperatory[]> {
  if (!subdomain || !locationId) throw new Error("Subdomain and Location ID are required.");
  
  const data = await fetchNexhealthAPI(
    '/operatories',
    subdomain,
    { location_id: locationId, page: '1', per_page: '300' }
  );
  
  console.log("Raw NexHealth operatories response:", JSON.stringify(data, null, 2));
  
  // Handle different possible response structures
  let operatories = null;
  
  if (Array.isArray(data)) {
    operatories = data;
  } else if (data?.data?.operatories && Array.isArray(data.data.operatories)) {
    operatories = data.data.operatories;
  } else if (data?.operatories && Array.isArray(data.operatories)) {
    operatories = data.operatories;
  } else if (data?.data && Array.isArray(data.data)) {
    operatories = data.data;
  } else {
    console.warn("Unexpected operatories response structure:", data);
    operatories = [];
  }
  
  console.log(`Parsed ${operatories.length} operatories`);
  return operatories.filter((op: NexHealthOperatory) => op.active !== false);
}

// Availability-related interfaces and functions
interface NexHealthAvailability {
  id: number;
  provider_id: number;
  location_id: number;
  operatory_id?: number;
  begin_time: string;
  end_time: string;
  days: string[];
  specific_date?: string;
  custom_recurrence?: {
    num: number;
    unit: string;
    ref: string;
  };
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
}

interface CreateAvailabilityData {
  provider_id: number;
  operatory_id?: number;
  days: string[];
  begin_time: string;
  end_time: string;
  appointment_type_ids: number[];
  active?: boolean;
}

interface UpdateAvailabilityData {
  provider_id?: number;
  operatory_id?: number;
  days?: string[];
  begin_time?: string;
  end_time?: string;
  appointment_type_ids?: number[];
  active?: boolean;
}

export async function createNexhealthAvailability(
  subdomain: string, 
  locationId: string, 
  availabilityData: CreateAvailabilityData
): Promise<NexHealthAvailability> {
  if (!subdomain || !locationId) {
    throw new Error("Subdomain and Location ID are required.");
  }

  const data = await fetchNexhealthAPI(
    '/availabilities',
    subdomain,
    { location_id: locationId },
    'POST',
    { availability: availabilityData }
  );

  console.log("Raw NexHealth create availability response:", JSON.stringify(data, null, 2));

  // Handle response structure
  let availability = null;
  
  if (data?.data) {
    availability = data.data;
  } else if (data?.availability) {
    availability = data.availability;
  } else {
    console.warn("Unexpected create availability response structure:", data);
    throw new Error("Invalid response structure from NexHealth create availability");
  }

  console.log(`Created availability with ID: ${availability.id}`);
  return availability;
}

export async function updateNexhealthAvailability(
  subdomain: string,
  nexhealthAvailabilityId: string,
  availabilityData: UpdateAvailabilityData
): Promise<NexHealthAvailability> {
  if (!subdomain || !nexhealthAvailabilityId) {
    throw new Error("Subdomain and availability ID are required.");
  }

  const data = await fetchNexhealthAPI(
    `/availabilities/${nexhealthAvailabilityId}`,
    subdomain,
    {},
    'PATCH',
    { availability: availabilityData }
  );

  console.log("Raw NexHealth update availability response:", JSON.stringify(data, null, 2));

  // Handle response structure
  let availability = null;
  
  if (data?.data) {
    availability = data.data;
  } else if (data?.availability) {
    availability = data.availability;
  } else {
    console.warn("Unexpected update availability response structure:", data);
    throw new Error("Invalid response structure from NexHealth update availability");
  }

  console.log(`Updated availability with ID: ${availability.id}`);
  return availability;
}

export async function deleteNexhealthAvailability(
  subdomain: string,
  nexhealthAvailabilityId: string
): Promise<void> {
  const response = await fetchNexhealthAPI(
    `/availabilities/${nexhealthAvailabilityId}`,
    subdomain,
    undefined,
    'DELETE'
  );
  
  // For DELETE operations, expect a 204 or successful response with no data
  console.log(`Deleted NexHealth availability ${nexhealthAvailabilityId}:`, response);
}

// Appointment Type CRUD Functions

interface CreateAppointmentTypeData {
  name: string;
  minutes: number;
  bookable_online?: boolean;
  parent_type: "Location" | "Institution";
  parent_id: string | number;
  emr_appt_descriptor_ids?: number[];
}

interface UpdateAppointmentTypeData {
  name?: string;
  minutes?: number;
  bookable_online?: boolean;
  parent_type?: "Location" | "Institution";
  parent_id?: string | number;
  emr_appt_descriptor_ids?: number[];
}

export async function createNexhealthAppointmentType(
  subdomain: string,
  locationId: string,
  apptTypeData: CreateAppointmentTypeData
): Promise<NexHealthAppointmentType> {
  const requestBody = {
    location_id: locationId,
    appointment_type: {
      name: apptTypeData.name,
      minutes: apptTypeData.minutes,
      bookable_online: apptTypeData.bookable_online ?? true,
      parent_type: apptTypeData.parent_type,
      parent_id: apptTypeData.parent_id,
      ...(apptTypeData.emr_appt_descriptor_ids && {
        emr_appt_descriptor_ids: apptTypeData.emr_appt_descriptor_ids
      })
    }
  };

  const response = await fetchNexhealthAPI(
    '/appointment_types',
    subdomain,
    undefined,
    'POST',
    requestBody
  );

  console.log('Created NexHealth appointment type:', response);
  return response.data;
}

export async function updateNexhealthAppointmentType(
  subdomain: string,
  nexhealthAppointmentTypeId: string,
  locationId: string,
  apptTypeData: UpdateAppointmentTypeData
): Promise<NexHealthAppointmentType> {
  const requestBody = {
    location_id: locationId,
    appointment_type: {
      ...(apptTypeData.name !== undefined && { name: apptTypeData.name }),
      ...(apptTypeData.minutes !== undefined && { minutes: apptTypeData.minutes }),
      ...(apptTypeData.bookable_online !== undefined && { bookable_online: apptTypeData.bookable_online }),
      ...(apptTypeData.parent_type !== undefined && { parent_type: apptTypeData.parent_type }),
      ...(apptTypeData.parent_id !== undefined && { parent_id: apptTypeData.parent_id }),
      ...(apptTypeData.emr_appt_descriptor_ids !== undefined && {
        emr_appt_descriptor_ids: apptTypeData.emr_appt_descriptor_ids
      })
    }
  };

  const response = await fetchNexhealthAPI(
    `/appointment_types/${nexhealthAppointmentTypeId}`,
    subdomain,
    undefined,
    'PATCH',
    requestBody
  );

  console.log(`Updated NexHealth appointment type ${nexhealthAppointmentTypeId}:`, response);
  return response.data;
}

export async function deleteNexhealthAppointmentType(
  subdomain: string,
  nexhealthAppointmentTypeId: string,
  locationId?: string
): Promise<void> {
  const params = locationId ? { location_id: locationId } : undefined;

  const response = await fetchNexhealthAPI(
    `/appointment_types/${nexhealthAppointmentTypeId}`,
    subdomain,
    params,
    'DELETE'
  );

  console.log(`Deleted NexHealth appointment type ${nexhealthAppointmentTypeId}:`, response);
}

// @deprecated: Appointment types are now managed directly in Laine and pushed to NexHealth. Syncing from NexHealth is no longer supported for appointment types.
interface NexHealthAppointmentSlot {
  lid: number; // Location ID
  pid: number; // Provider ID
  slots: Array<{
    time: string; // ISO string like "2025-12-23T07:00:00.000-06:00"
    operatory_id?: number;
  }>;
}



/**
 * Fetch available appointment slots from NexHealth API
 */
export async function getNexhealthAvailableSlots(
  subdomain: string,
  locationId: string,
  startDate: string, // YYYY-MM-DD format
  daysToSearch: number,
  providerNexHealthIds: string[],
  slotLengthMinutes: number
): Promise<NexHealthAppointmentSlot[]> {
  try {
    console.log(`[NexHealth Slots] Fetching slots for ${startDate}, ${daysToSearch} days, providers: ${providerNexHealthIds.join(',')}, slot length: ${slotLengthMinutes} minutes`);

    // Build query parameters
    const params: Record<string, string | number | string[]> = {
      start_date: startDate,
      days: daysToSearch,
      'lids[]': locationId,
      slot_length: slotLengthMinutes,
    };

    // Add provider IDs as array parameters
    if (providerNexHealthIds.length > 0) {
      params['pids[]'] = providerNexHealthIds;
    }

    // Call NexHealth API
    const response = await fetchNexhealthAPI('/appointment_slots', subdomain, params);
    
    if (!response.data) {
      console.error('[NexHealth Slots] Invalid response structure:', response);
      throw new Error('Invalid response structure from NexHealth /appointment_slots');
    }

    const slotsData: NexHealthAppointmentSlot[] = response.data;
    console.log(`[NexHealth Slots] Successfully fetched ${slotsData.length} slot groups`);
    
    return slotsData;
  } catch (error) {
    console.error('[NexHealth Slots] Error fetching appointment slots:', error);
    throw error;
  }
}

export async function syncPracticeAppointmentTypes(
  practiceId: string,
  subdomain: string,
  locationId: string
): Promise<void> {
  try {
    console.log(`Syncing appointment types for practice ${practiceId}...`);
    
    // Fetch appointment types from NexHealth
    const nexhealthAppointmentTypes = await getAppointmentTypes(subdomain, locationId);
    
    console.log(`Found ${nexhealthAppointmentTypes.length} appointment types from NexHealth`);

    // Sync each appointment type with local database
    for (const nexhealthType of nexhealthAppointmentTypes) {
      try {
        await prisma.appointmentType.upsert({
          where: {
            practiceId_nexhealthAppointmentTypeId: {
              practiceId,
              nexhealthAppointmentTypeId: nexhealthType.id.toString()
            }
          },
          update: {
            name: nexhealthType.name,
            duration: nexhealthType.minutes,
            bookableOnline: nexhealthType.bookable_online,
            parentType: nexhealthType.parent_type,
            parentId: nexhealthType.parent_id.toString(),
            lastSyncError: null, // Clear any previous errors on successful sync
            updatedAt: new Date()
          },
          create: {
            practiceId,
            nexhealthAppointmentTypeId: nexhealthType.id.toString(),
            name: nexhealthType.name,
            duration: nexhealthType.minutes,
            bookableOnline: nexhealthType.bookable_online,
            parentType: nexhealthType.parent_type,
            parentId: nexhealthType.parent_id.toString()
          }
        });

        console.log(`Synced appointment type: ${nexhealthType.name} (ID: ${nexhealthType.id})`);
      } catch (error) {
        console.error(`Error syncing appointment type ${nexhealthType.id}:`, error);
        
        // Try to update just the error field if the record exists
        try {
          await prisma.appointmentType.update({
            where: {
              practiceId_nexhealthAppointmentTypeId: {
                practiceId,
                nexhealthAppointmentTypeId: nexhealthType.id.toString()
              }
            },
            data: {
              lastSyncError: error instanceof Error ? error.message : 'Unknown sync error',
              updatedAt: new Date()
            }
          });
        } catch (updateError) {
          console.error(`Failed to update sync error for appointment type ${nexhealthType.id}:`, updateError);
        }
      }
    }

    console.log(`Completed syncing appointment types for practice ${practiceId}`);
  } catch (error) {
    console.error(`Error syncing appointment types for practice ${practiceId}:`, error);
    throw error;
  }
} 