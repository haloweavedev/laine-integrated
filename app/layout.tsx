import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Laine AI Voice Assistant",
  description: "Advanced voice assistant for healthcare practices with seamless NexHealth integration",
};

async function Header() {
  const { userId } = await auth();
  
  return (
    <header className="fixed top-0 left-0 right-0 bg-white/10 backdrop-blur-md border-b border-slate-200/30 z-50">
      <div className="flex items-center justify-between max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Laine AI</h1>
        </div>
        <div className="flex items-center gap-4">
          {userId ? (
            <div className="flex items-center gap-4">
              <a 
                href="/practice-config" 
                className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Practice Config
              </a>
              <a 
                href="/laine" 
                className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Laine Assistant
              </a>
              <UserButton afterSignOutUrl="/" />
            </div>
          ) : (
            <>
              <SignInButton mode="modal">
                <button className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Sign Up
                </button>
              </SignUpButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50`}
        >
          <Header />
          <main className="pt-20">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  );
}
