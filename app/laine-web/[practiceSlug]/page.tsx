import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { SchedulingProvider } from '../components/SchedulingContext';
import { LaineWebStepper } from '../components/LaineWebStepper';

interface PageProps {
  params: Promise<{ practiceSlug: string }>;
}

export default async function LaineWebPage({ params }: PageProps) {
  const { practiceSlug } = await params;

  // Fetch practice data by slug
  const practice = await prisma.practice.findUnique({
    where: { 
      slug: practiceSlug 
    },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      nexhealthSubdomain: true,
      nexhealthLocationId: true
    }
  });

  // If practice not found, show 404
  if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
    notFound();
  }

  // Ensure required fields are available
  const practiceData = {
    id: practice.id,
    name: practice.name,
    slug: practice.slug!,
    timezone: practice.timezone,
    nexhealthSubdomain: practice.nexhealthSubdomain,
    nexhealthLocationId: practice.nexhealthLocationId
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Schedule Your Appointment
            </h1>
            {practice.name && (
              <p className="text-lg text-gray-600">
                {practice.name}
              </p>
            )}
          </div>
          
          <SchedulingProvider practice={practiceData}>
            <LaineWebStepper />
          </SchedulingProvider>
        </div>
      </div>
    </div>
  );
} 