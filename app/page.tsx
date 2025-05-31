import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export default async function HomePage() {
  const { userId } = await auth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-16">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto mb-20">
          <div className="mb-6">
            <span className="inline-block px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-full border border-blue-200">
              Now Available
            </span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            Laine Voice AI
          </h1>
          
          <p className="text-xl text-slate-600 mb-10 leading-relaxed max-w-2xl mx-auto">
            Intelligent voice assistant that seamlessly integrates with your EHR system to streamline appointment scheduling and enhance patient communication.
          </p>
          
          {userId ? (
            <div className="space-y-6">
              <p className="text-lg text-slate-700">
                Welcome back! Ready to configure your practice?
              </p>
              <Link
                href="/practice-config"
                className="inline-flex items-center px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Go to Practice Configuration
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-lg text-slate-700">
                Get started by creating your account to configure your practice.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  Get Started
                  <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center px-8 py-4 bg-white text-slate-700 font-semibold rounded-xl border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all duration-200"
                >
                  Sign In
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Features Grid */}
        <div className="max-w-4xl mx-auto">
          {/* Core Features */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-900">Core Capabilities</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {[
                  "Voice-Powered Scheduling",
                  "EHR System Integration", 
                  "Natural Language Processing",
                  "Real-time Appointment Management"
                ].map((feature, index) => (
                  <div key={index} className="flex items-center">
                    <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-slate-700 font-medium">{feature}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                {[
                  "Automated Patient Communication",
                  "Practice Workflow Optimization",
                  "Secure Data Handling",
                  "24/7 Availability"
                ].map((feature, index) => (
                  <div key={index} className="flex items-center">
                    <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-slate-700 font-medium">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-20">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Ready to Enhance Your Practice?
            </h2>
            <p className="text-lg text-slate-600 mb-8">
              Transform your appointment scheduling with AI-powered voice assistance that integrates seamlessly with your existing systems.
            </p>
            {!userId && (
              <Link
                href="/sign-up"
                className="inline-flex items-center px-8 py-4 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                Start Your Configuration
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
