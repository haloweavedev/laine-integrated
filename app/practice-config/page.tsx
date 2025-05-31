import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAppointmentTypes, getProviders } from "@/lib/nexhealth";

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

async function savePracticeConfig(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const name = formData.get("practiceName") as string | null;
  const subdomain = formData.get("nexhealthSubdomain") as string;
  const locationId = formData.get("nexhealthLocationId") as string;

  if (!subdomain || !locationId) {
    throw new Error("Subdomain and Location ID are required.");
  }

  try {
    await prisma.practice.upsert({
      where: { clerkUserId: userId },
      update: { name, nexhealthSubdomain: subdomain, nexhealthLocationId: locationId },
      create: { clerkUserId: userId, name, nexhealthSubdomain: subdomain, nexhealthLocationId: locationId },
    });
    revalidatePath("/practice-config");
  } catch (error) {
    console.error("Error saving practice config:", error);
    throw new Error("Failed to save configuration.");
  }
}

async function syncNexhealthData() {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  try {
    // Get the practice for this user
    const practice = await prisma.practice.findUnique({
      where: { clerkUserId: userId },
    });

    if (!practice) {
      throw new Error("Practice not found.");
    }

    if (!practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
      throw new Error("NexHealth configuration missing. Please configure your subdomain and location ID first.");
    }

    // Fetch data from NexHealth
    const [appointmentTypes, providers] = await Promise.all([
      getAppointmentTypes(practice.nexhealthSubdomain, practice.nexhealthLocationId),
      getProviders(practice.nexhealthSubdomain, practice.nexhealthLocationId),
    ]);

    // Sync appointment types
    const appointmentTypePromises = appointmentTypes.map((type: NexHealthAppointmentType) =>
      prisma.appointmentType.upsert({
        where: {
          practiceId_nexhealthAppointmentTypeId: {
            practiceId: practice.id,
            nexhealthAppointmentTypeId: type.id.toString(),
          },
        },
        update: {
          name: type.name,
          duration: parseInt(type.duration.toString()) || 0,
        },
        create: {
          practiceId: practice.id,
          nexhealthAppointmentTypeId: type.id.toString(),
          name: type.name,
          duration: parseInt(type.duration.toString()) || 0,
        },
      })
    );

    // Sync providers
    const providerPromises = providers.map((provider: NexHealthProvider) =>
      prisma.provider.upsert({
        where: {
          practiceId_nexhealthProviderId: {
            practiceId: practice.id,
            nexhealthProviderId: provider.id.toString(),
          },
        },
        update: {
          firstName: provider.first_name || null,
          lastName: provider.last_name || provider.name || "Unknown",
        },
        create: {
          practiceId: practice.id,
          nexhealthProviderId: provider.id.toString(),
          firstName: provider.first_name || null,
          lastName: provider.last_name || provider.name || "Unknown",
        },
      })
    );

    // Execute all upserts
    await Promise.all([...appointmentTypePromises, ...providerPromises]);

    revalidatePath("/practice-config");
  } catch (error) {
    console.error("Error syncing NexHealth data:", error);
    throw new Error("Failed to sync NexHealth data. Please check your configuration and try again.");
  }
}

export default async function PracticeConfigPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const practice = await prisma.practice.findUnique({ 
    where: { clerkUserId: userId },
    include: {
      appointmentTypes: true,
      providers: true,
    }
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Practice Configuration</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
        <form action={savePracticeConfig} className="space-y-4">
          <div>
            <label htmlFor="practiceName" className="block text-sm font-medium text-gray-700 mb-1">
              Practice Name (Optional)
            </label>
            <input
              type="text"
              id="practiceName"
              name="practiceName"
              defaultValue={practice?.name || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your practice name"
            />
          </div>
          
          <div>
            <label htmlFor="nexhealthSubdomain" className="block text-sm font-medium text-gray-700 mb-1">
              NexHealth Subdomain *
            </label>
            <input
              type="text"
              id="nexhealthSubdomain"
              name="nexhealthSubdomain"
              defaultValue={practice?.nexhealthSubdomain || ""}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., testdental"
            />
            <p className="text-sm text-gray-500 mt-1">
              Your NexHealth subdomain (the part before .nexhealth.com)
            </p>
          </div>
          
          <div>
            <label htmlFor="nexhealthLocationId" className="block text-sm font-medium text-gray-700 mb-1">
              NexHealth Location ID *
            </label>
            <input
              type="text"
              id="nexhealthLocationId"
              name="nexhealthLocationId"
              defaultValue={practice?.nexhealthLocationId || ""}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 123"
            />
            <p className="text-sm text-gray-500 mt-1">
              Your NexHealth Location ID number
            </p>
          </div>
          
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Save Configuration
          </button>
        </form>
      </div>

      {practice?.nexhealthSubdomain && practice?.nexhealthLocationId && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">NexHealth Data</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Appointment Types</h3>
              <p className="text-sm text-gray-600 mb-3">
                {practice.appointmentTypes.length} synced
              </p>
              {practice.appointmentTypes.length > 0 && (
                <ul className="text-sm space-y-1">
                  {practice.appointmentTypes.slice(0, 5).map((type) => (
                    <li key={type.id} className="text-gray-700">
                      {type.name} ({type.duration} min)
                    </li>
                  ))}
                  {practice.appointmentTypes.length > 5 && (
                    <li className="text-gray-500">
                      ... and {practice.appointmentTypes.length - 5} more
                    </li>
                  )}
                </ul>
              )}
            </div>
            
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Providers</h3>
              <p className="text-sm text-gray-600 mb-3">
                {practice.providers.length} synced
              </p>
              {practice.providers.length > 0 && (
                <ul className="text-sm space-y-1">
                  {practice.providers.slice(0, 5).map((provider) => (
                    <li key={provider.id} className="text-gray-700">
                      {provider.firstName} {provider.lastName}
                    </li>
                  ))}
                  {practice.providers.length > 5 && (
                    <li className="text-gray-500">
                      ... and {practice.providers.length - 5} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
          
          <div className="mt-6">
            <form action={syncNexhealthData}>
              <button
                type="submit"
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                Sync NexHealth Data
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 