import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface PatientRequest {
  practiceId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dob?: string;
  type: 'lookup' | 'create';
  providerId?: number; // Required for creating new patients
}

interface NexhealthPatient {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  name: string;
  bio: {
    phone_number: string;
    date_of_birth: string;
    new_patient: boolean;
  };
}

interface NexhealthPatientSearchResponse {
  code: boolean;
  data?: {
    patients: NexhealthPatient[];
  };
  count?: number;
  error?: string;
}

interface NexhealthPatientCreateResponse {
  code: boolean;
  description?: string;
  data?: {
    user: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
      name: string;
      bio: {
        phone_number: string;
        date_of_birth: string;
        new_patient: boolean;
      };
    };
  };
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PatientRequest = await request.json();
    const { practiceId, firstName, lastName, email, phone, dob, type, providerId } = body;

    if (!practiceId || !firstName || !lastName || !type) {
      return NextResponse.json(
        { error: 'practiceId, firstName, lastName, and type are required' },
        { status: 400 }
      );
    }

    if (type !== 'lookup' && type !== 'create') {
      return NextResponse.json(
        { error: 'type must be either "lookup" or "create"' },
        { status: 400 }
      );
    }

    console.log(`[Patient API] ${type === 'lookup' ? 'Looking up' : 'Creating'} patient: ${firstName} ${lastName}`);

    // Get practice configuration
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId }
    });

    if (!practice) {
      return NextResponse.json(
        { error: 'Practice not found' },
        { status: 404 }
      );
    }

    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      return NextResponse.json(
        { error: 'Practice NexHealth configuration is incomplete' },
        { status: 400 }
      );
    }

    const apiToken = process.env.NEXHEALTH_API_KEY;
    if (!apiToken) {
      console.error('[Patient API] Critical Error: NEXHEALTH_API_KEY is not set in the environment.');
      return NextResponse.json(
        { error: 'Server configuration error: Missing API token.' },
        { status: 500 }
      );
    }

    if (type === 'lookup') {
      // Search for existing patient
      const searchParams = new URLSearchParams();
      searchParams.append('subdomain', practice.nexhealthSubdomain);
      searchParams.append('location_id', practice.nexhealthLocationId);
      searchParams.append('name', `${firstName} ${lastName}`);
      searchParams.append('new_patient', 'false');
      searchParams.append('location_strict', 'false');
      searchParams.append('sort', 'name');
      searchParams.append('page', '1');
      searchParams.append('per_page', '10');

      const searchUrl = `https://nexhealth.info/patients?${searchParams.toString()}`;
      console.log(`[Patient API] Searching for patient: ${searchUrl}`);

      const searchResponse = await fetch(searchUrl, {
        headers: {
          'Authorization': apiToken,
          'accept': 'application/vnd.Nexhealth+json;version=2'
        }
      });

      const responseText = await searchResponse.text();
      console.log('[Patient API] Raw NexHealth Search Response:', responseText);

      if (!searchResponse.ok) {
        console.error(`[Patient API] NexHealth search error: ${searchResponse.status}`);
        return NextResponse.json(
          { error: 'Failed to search for patient in NexHealth' },
          { status: 500 }
        );
      }

      const searchData: NexhealthPatientSearchResponse = JSON.parse(responseText);

      if (!searchData.code) {
        console.error('[Patient API] NexHealth search failed:', searchData.error);
        return NextResponse.json(
          { error: searchData.error || 'Patient search failed' },
          { status: 400 }
        );
      }

      const patients = searchData.data?.patients || [];
      
      // Filter patients by DOB if provided for more accurate matching
      let matchedPatients = patients;
      if (dob) {
        matchedPatients = patients.filter(patient => 
          patient.bio.date_of_birth === dob
        );
      }

      console.log(`[Patient API] Found ${patients.length} total patients, ${matchedPatients.length} matched by DOB`);

      return NextResponse.json({
        success: true,
        type: 'lookup',
        patients: matchedPatients.map(patient => ({
          id: patient.id,
          firstName: patient.first_name,
          lastName: patient.last_name,
          email: patient.email,
          name: patient.name,
          phone: patient.bio.phone_number,
          dateOfBirth: patient.bio.date_of_birth,
          isNewPatient: patient.bio.new_patient
        }))
      });

    } else {
      // Create new patient
      if (!email || !phone || !dob) {
        return NextResponse.json(
          { error: 'email, phone, and dob are required for creating new patients' },
          { status: 400 }
        );
      }

      if (!providerId) {
        return NextResponse.json(
          { error: 'providerId is required for creating new patients' },
          { status: 400 }
        );
      }

      const createData = {
        provider: {
          provider_id: providerId
        },
        patient: {
          bio: {
            phone_number: phone.replace(/\D/g, ''), // Remove formatting
            date_of_birth: dob
          },
          first_name: firstName,
          last_name: lastName,
          email: email
        }
      };

      const createUrl = `https://nexhealth.info/patients?subdomain=${practice.nexhealthSubdomain}&location_id=${practice.nexhealthLocationId}`;
      console.log(`[Patient API] Creating patient: ${createUrl}`);
      console.log(`[Patient API] Create data:`, JSON.stringify(createData, null, 2));

      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': apiToken,
          'accept': 'application/vnd.Nexhealth+json;version=2',
          'content-type': 'application/json'
        },
        body: JSON.stringify(createData)
      });

      const responseText = await createResponse.text();
      console.log('[Patient API] Raw NexHealth Create Response:', responseText);

      if (!createResponse.ok) {
        console.error(`[Patient API] NexHealth create error: ${createResponse.status}`);
        return NextResponse.json(
          { error: 'Failed to create patient in NexHealth' },
          { status: 500 }
        );
      }

      const createData_response: NexhealthPatientCreateResponse = JSON.parse(responseText);

      if (!createData_response.code) {
        console.error('[Patient API] NexHealth create failed:', createData_response.error);
        return NextResponse.json(
          { error: createData_response.error || 'Patient creation failed' },
          { status: 400 }
        );
      }

      const createdPatient = createData_response.data?.user;
      if (!createdPatient) {
        return NextResponse.json(
          { error: 'No patient data returned from NexHealth' },
          { status: 500 }
        );
      }

      console.log(`[Patient API] Successfully created patient with ID: ${createdPatient.id}`);

      return NextResponse.json({
        success: true,
        type: 'create',
        patient: {
          id: createdPatient.id,
          firstName: createdPatient.first_name,
          lastName: createdPatient.last_name,
          email: createdPatient.email,
          name: createdPatient.name,
          phone: createdPatient.bio.phone_number,
          dateOfBirth: createdPatient.bio.date_of_birth,
          isNewPatient: createdPatient.bio.new_patient
        }
      });
    }

  } catch (error) {
    console.error('[Patient API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error while processing patient request' },
      { status: 500 }
    );
  }
}