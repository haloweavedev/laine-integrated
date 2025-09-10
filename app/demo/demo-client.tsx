"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, ClipboardCopy, ClipboardCheck } from 'lucide-react';
import { ConversationView } from './ConversationView';
import { useLaineDemo } from './useLaineDemo';

interface DemoClientProps {
  vapiAssistantId: string;
}

export function DemoClient({ vapiAssistantId }: DemoClientProps) {
  const { messages, isCalling, isUserSpeaking, callStatus, start, stop } = useLaineDemo(vapiAssistantId);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyTranscript = async () => {
    if (messages.length === 0) {
      return;
    }

    // Format messages into a readable transcript
    const transcript = messages
      .map((message) => {
        const timestamp = message.timestamp.toLocaleString();
        
        switch (message.type) {
          case 'transcript':
            const speaker = message.role === 'assistant' ? 'Laine' : 'You';
            return `[${timestamp}] ${speaker}: ${message.text}`;
          
          case 'tool-call':
            return `[${timestamp}] [System: Laine is using ${message.toolName}]`;
          
          case 'tool-result':
            const status = message.isSuccess ? 'Success' : 'Failed';
            return `[${timestamp}] [System: Tool ${status} - ${message.toolName}]`;
          
          default:
            return '';
        }
      })
      .filter(line => line.length > 0)
      .join('\n');

    try {
      await navigator.clipboard.writeText(transcript);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy transcript:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Demo Container */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Header Section */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white mb-2">
                Laine Demo
              </h1>
              <p className="text-blue-100 mb-4">
                Experience our AI dental assistant in real-time
              </p>
              {/* Enhanced Status Badge */}
              <div className="flex justify-center">
                <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold ${
                  callStatus === 'connecting' 
                    ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-300'
                    : callStatus === 'connected'
                    ? 'bg-green-100 text-green-800 border-2 border-green-300'
                    : callStatus === 'ended'
                    ? 'bg-gray-100 text-gray-600 border-2 border-gray-300'
                    : callStatus === 'error'
                    ? 'bg-red-100 text-red-800 border-2 border-red-300'
                    : 'bg-gray-100 text-gray-600 border-2 border-gray-300'
                }`}>
                  <div className={`w-2 h-2 rounded-full mr-2 ${
                    callStatus === 'connecting' 
                      ? 'bg-yellow-500 animate-pulse'
                      : callStatus === 'connected'
                      ? 'bg-green-500 animate-pulse'
                      : callStatus === 'ended'
                      ? 'bg-gray-400'
                      : callStatus === 'error'
                      ? 'bg-red-500'
                      : 'bg-gray-400'
                  }`} />
                  {callStatus === 'connecting' && 'Connecting...'}
                  {callStatus === 'connected' && 'Live'}
                  {callStatus === 'ended' && 'Call Ended'}
                  {callStatus === 'error' && 'Error'}
                  {callStatus === 'idle' && 'Ready'}
                </div>
              </div>
            </div>
          </div>

          {/* Status Section */}
          <div className="p-4 bg-gray-50 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                  isCalling ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                }`} />
                <span className="text-sm font-medium text-gray-700">
                  {isCalling ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  onClick={handleCopyTranscript}
                  variant="ghost"
                  size="sm"
                  disabled={messages.length === 0}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
                >
                  {isCopied ? (
                    <>
                      <ClipboardCheck className="w-4 h-4" />
                      <span className="text-xs">Copied!</span>
                    </>
                  ) : (
                    <>
                      <ClipboardCopy className="w-4 h-4" />
                      <span className="text-xs">Copy Transcript</span>
                    </>
                  )}
                </Button>
                <div className="text-xs text-gray-500 font-mono">
                  Assistant: {vapiAssistantId}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="min-h-[500px] max-h-[70vh] flex flex-col">
            {/* Conversation View */}
            <div className="flex-1 overflow-hidden">
              <ConversationView messages={messages} />
            </div>

            {/* Footer Controls */}
            <div className="border-t bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-center space-x-4">
                <Button
                  onClick={start}
                  disabled={isCalling || callStatus === 'connecting'}
                  variant={isCalling ? "secondary" : "default"}
                  size="lg"
                  className="min-w-32"
                >
                  {callStatus === 'connecting' && 'Connecting...'}
                  {callStatus === 'connected' && 'Connected'}
                  {(callStatus === 'idle' || callStatus === 'ended' || callStatus === 'error') && 'Start Call'}
                </Button>
                <Button
                  onClick={stop}
                  disabled={!isCalling}
                  variant="destructive"
                  size="lg"
                  className="min-w-32"
                >
                  End Call
                </Button>
              </div>
              
              {/* Voice Activity Indicator */}
              {isCalling && (
                <div className="flex items-center justify-center mt-4 space-x-2">
                  <div className={`flex items-center space-x-2 px-3 py-2 rounded-full transition-all duration-200 ${
                    isUserSpeaking 
                      ? 'bg-green-100 border-2 border-green-300' 
                      : 'bg-gray-100 border-2 border-gray-200'
                  }`}>
                    <Mic className={`w-4 h-4 transition-colors duration-200 ${
                      isUserSpeaking ? 'text-green-600 animate-pulse' : 'text-gray-400'
                    }`} />
                    <span className={`text-sm font-medium transition-colors duration-200 ${
                      isUserSpeaking ? 'text-green-700' : 'text-gray-500'
                    }`}>
                      {isUserSpeaking ? 'You are speaking...' : 'Listening'}
                    </span>
                  </div>
                </div>
              )}
              
              {!isCalling && (
                <p className="text-center text-sm text-gray-500 mt-3">
                  Click &quot;Start Call&quot; to begin your conversation with Laine
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Instructions Section */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            How to Use the Demo
          </h2>
          <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-600">
            <div className="flex items-start space-x-2">
              <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-blue-600">1</span>
              </div>
              <div>
                <p className="font-medium text-gray-800">Start the Call</p>
                <p>Click &quot;Start Call&quot; to initiate a voice conversation with Laine.</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-blue-600">2</span>
              </div>
              <div>
                <p className="font-medium text-gray-800">Speak Naturally</p>
                <p>Talk to Laine about appointments, insurance, or ask questions.</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-blue-600">3</span>
              </div>
              <div>
                <p className="font-medium text-gray-800">Watch the Magic</p>
                <p>See real-time transcripts and tool usage as Laine helps you.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
