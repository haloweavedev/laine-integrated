interface NexHealthAppointmentType {
  id: string | number;
  name: string;
  duration: string | number;
}

interface NexHealthProvider {
  id: string | number;
  first_name?: string;
  last_name?: string;
  name?: string;
}

const NEXHEALTH_API_BASE_URL = process.env.NEXHEALTH_API_BASE_URL!;
const NEXHEALTH_API_KEY = process.env.NEXHEALTH_API_KEY!; // Global API Key

async function fetchNexhealthAPI(
  path: string, // e.g., "/appointment_types"
  subdomain: string, // Practice-specific subdomain
  params?: Record<string, string | number | string[]>,
  method: string = 'GET',
  body?: unknown
) {
  if (!NEXHEALTH_API_KEY) {
    throw new Error("NEXHEALTH_API_KEY is not configured in environment variables.");
  }
  
  const url = new URL(`${NEXHEALTH_API_BASE_URL}${path}`);
  
  // Always add subdomain for GET requests if not already in params
  if (!params?.subdomain) {
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
      'Authorization': `Bearer ${NEXHEALTH_API_KEY}`, // Use global key
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
  
  return data?.data?.appointment_types || data?.appointment_types || data || [];
}

export async function getProviders(subdomain: string, locationId: string): Promise<NexHealthProvider[]> {
  if (!subdomain || !locationId) throw new Error("Subdomain and Location ID are required.");
  
  const data = await fetchNexhealthAPI(
    '/providers',
    subdomain,
    { location_id: locationId, requestable: 'true' }
  );
  
  return data?.data?.providers || data?.providers || data || [];
} 