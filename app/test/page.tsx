import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAssistantPhoneNumber, getLatestCallLogForPractice, getPracticeAndAssistantId, LatestCallLogData } from "./actions";
import { TestClient } from "./test-client"; // We will create this next

export default async function TestPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  let practiceId: string;
  let vapiAssistantId: string;
  let phoneNumber: string | null = null;
  let latestCallLog: LatestCallLogData | null = null;

  try {
    const assistantInfo = await getPracticeAndAssistantId();
    practiceId = assistantInfo.practiceId;
    vapiAssistantId = assistantInfo.vapiAssistantId;

    phoneNumber = await getAssistantPhoneNumber(vapiAssistantId);
    latestCallLog = await getLatestCallLogForPractice(practiceId);
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
      <TestClient
        vapiAssistantId={vapiAssistantId}
        initialPhoneNumber={phoneNumber}
        initialLatestCallLog={latestCallLog}
      />
    </div>
  );
} 