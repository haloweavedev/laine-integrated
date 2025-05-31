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

async function fetchNexhealthAPI(
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

  console.log(`Fetching from NexHealth: ${method} ${url.toString()} for subdomain ${subdomain}`);

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
  
  console.log("Raw NexHealth appointment_types response:", JSON.stringify(data, null, 2));
  
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
  
  console.log(`Parsed ${appointmentTypes.length} appointment types`);
  return appointmentTypes;
}

export async function getProviders(subdomain: string, locationId: string): Promise<NexHealthProvider[]> {
  if (!subdomain || !locationId) throw new Error("Subdomain and Location ID are required.");
  
  const data = await fetchNexhealthAPI(
    '/providers',
    subdomain,
    { location_id: locationId, inactive: 'false' }
  );
  
  console.log("Raw NexHealth providers response:", JSON.stringify(data, null, 2));
  
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
  
  console.log(`Parsed ${providers.length} providers`);
  return providers;
} 