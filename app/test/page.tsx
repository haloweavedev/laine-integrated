import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAssistantPhoneNumber, getLatestCallLogForPractice, getPracticeAndAssistantId, LatestCallLogData, PracticeTestData } from "./actions";
import { TestClient } from "./test-client"; // We will create this next

export default async function TestPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  let practiceData: PracticeTestData;
  let phoneNumber: string | null = null;
  let latestCallLog: LatestCallLogData | null = null;

  try {
    practiceData = await getPracticeAndAssistantId();

    phoneNumber = await getAssistantPhoneNumber(practiceData.vapiAssistantId);
    latestCallLog = await getLatestCallLogForPractice(practiceData.practiceId);
  } catch (error) {
    // Errors during data fetching (e.g., redirects from actions) will be handled by Next.js
    // If an error is thrown and not a redirect, it will bubble up.
    // For simplicity, we assume redirects handle missing setup.
    // If not redirecting, render an error message or a link to setup.
    if (error instanceof Error && (error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    console.error("Error fetching data for /test page:", error);
    // Render a fallback or error state if necessary
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Error Loading Test Page</h1>
        <p>Could not load necessary information. Please ensure your practice and Laine assistant are configured.</p>
        <p>Error: {error instanceof Error ? error.message : "Unknown error"}</p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-slate-800">Laine Assistant Test Center</h1>
      
      {/* Practice Information Panel */}
      <div className="bg-slate-50 p-6 rounded-lg shadow-sm mb-8 border border-slate-200">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">Practice Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-slate-600">Practice Name:</span>
            <span className="ml-2 text-slate-800">{practiceData.practiceName}</span>
          </div>
          <div>
            <span className="font-medium text-slate-600">Timezone:</span>
            <span className="ml-2 text-slate-800">{practiceData.timezone}</span>
          </div>
          <div>
            <span className="font-medium text-slate-600">NexHealth Subdomain:</span>
            <span className="ml-2 text-slate-800 font-mono">
              {practiceData.nexhealthSubdomain || "Not configured"}
            </span>
          </div>
          <div>
            <span className="font-medium text-slate-600">NexHealth Location ID:</span>
            <span className="ml-2 text-slate-800 font-mono">
              {practiceData.nexhealthLocationId || "Not configured"}
            </span>
          </div>
        </div>
        {(!practiceData.nexhealthSubdomain || !practiceData.nexhealthLocationId) && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              ⚠️ NexHealth configuration incomplete. Some test features may not work.
              <a href="/practice-config" className="ml-2 text-blue-600 hover:underline">
                Configure now →
              </a>
            </p>
          </div>
        )}
      </div>

      <TestClient
        practiceData={practiceData}
        initialPhoneNumber={phoneNumber}
        initialLatestCallLog={latestCallLog}
      />
    </div>
  );
} 