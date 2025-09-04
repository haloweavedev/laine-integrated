"use client";

import Vapi from "@vapi-ai/web";
import { useEffect, useState, useRef } from "react";

// TypeScript types for our rich message format
export type MessageType = 'transcript' | 'tool-call' | 'tool-result';

export interface TranscriptMessage {
  type: 'transcript';
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  timestamp: Date;
}

export interface ToolCallMessage {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  timestamp: Date;
}

export interface ToolResultMessage {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown; // The parsed result from the ToolLog
  isSuccess: boolean;
  timestamp: Date;
}

export type DemoMessage = TranscriptMessage | ToolCallMessage | ToolResultMessage;

export function useLaineDemo(vapiAssistantId: string) {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [isCalling, setIsCalling] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended' | 'error'>('idle');
  const vapiRef = useRef<Vapi | null>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY) {
      console.error("NEXT_PUBLIC_VAPI_PUBLIC_KEY is not set.");
      return;
    }

    const vapiInstance = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY);
    vapiRef.current = vapiInstance;

    // Set up VAPI event listeners
    vapiInstance.on('call-start', () => {
      console.log('Demo call started');
      setIsCalling(true);
      setCallStatus('connected');
      setMessages([]); // Clear previous messages
    });

    vapiInstance.on('call-end', () => {
      console.log('Demo call ended');
      setIsCalling(false);
      setCallStatus('ended');
    });

    vapiInstance.on('error', (e) => {
      console.error('Demo Vapi SDK error:', e);
      setIsCalling(false);
      setCallStatus('error');
    });

    // Voice activity listeners
    vapiInstance.on('speech-start', () => {
      console.log('Speech started');
      // For now, assume user is speaking when speech starts during a call
      // In a more sophisticated setup, we could differentiate between user and assistant speech
      setIsUserSpeaking(true);
    });

    vapiInstance.on('speech-end', () => {
      console.log('Speech ended');
      setIsUserSpeaking(false);
    });

    vapiInstance.on('message', (message) => {
      console.log('Demo Vapi message:', message); // For debugging

      if (message.type === 'transcript') {
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        const isFinal = message.transcriptType === 'final';
        const text = message.transcript || '';

        setMessages(prevMessages => {
          const newMessages = [...prevMessages];
          
          // Check if the last message is a partial transcript from the same role
          const lastMessage = newMessages[newMessages.length - 1];
          const isLastMessagePartialFromSameRole = 
            lastMessage && 
            lastMessage.type === 'transcript' && 
            lastMessage.role === role && 
            !lastMessage.isFinal;

          if (isLastMessagePartialFromSameRole) {
            // Update the existing partial transcript in-place
            const updatedMessage: TranscriptMessage = {
              ...lastMessage,
              text,
              isFinal,
              timestamp: new Date()
            };
            newMessages[newMessages.length - 1] = updatedMessage;
          } else {
            // Add new transcript message
            const newMessage: TranscriptMessage = {
              type: 'transcript',
              role,
              text,
              isFinal,
              timestamp: new Date()
            };
            newMessages.push(newMessage);
          }

          return newMessages;
        });
      }

      if (message.type === 'function-call') {
        const toolCallId = message.functionCall?.id;
        const toolName = message.functionCall?.name || 'unknown';
        const toolArgs = message.functionCall?.parameters || {};

        if (!toolCallId) {
          console.error('Function call message missing toolCallId:', message);
          return;
        }

        const newMessage: ToolCallMessage = {
          type: 'tool-call',
          toolCallId,
          toolName,
          toolArgs,
          timestamp: new Date()
        };
        
        setMessages(prevMessages => [...prevMessages, newMessage]);

        // Start polling for the tool result
        pollForToolResult(toolCallId, toolName);
      }
    });

    // Function to poll for tool results
    const pollForToolResult = async (toolCallId: string, toolName: string) => {
      const maxAttempts = 20; // 10 seconds total (500ms * 20)
      let attempts = 0;

      const poll = async () => {
        attempts++;
        
        try {
          const response = await fetch(`/api/tool-log/${toolCallId}`);
          
          if (response.ok) {
            const toolLog = await response.json();
            
            // If the result is ready (has result field), replace the ToolCallMessage
            if (toolLog.hasResult) {
              const toolResultMessage: ToolResultMessage = {
                type: 'tool-result',
                toolCallId,
                toolName,
                result: toolLog.result,
                isSuccess: toolLog.success,
                timestamp: new Date()
              };

              setMessages(prevMessages => {
                return prevMessages.map(msg => {
                  // Replace the matching ToolCallMessage with ToolResultMessage
                  if (msg.type === 'tool-call' && msg.toolCallId === toolCallId) {
                    return toolResultMessage;
                  }
                  return msg;
                });
              });

              console.log(`Tool result received for ${toolCallId}:`, toolLog.result);
              return; // Stop polling
            }
          }
          
          // Continue polling if result not ready and we haven't exceeded max attempts
          if (attempts < maxAttempts) {
            setTimeout(poll, 500); // Poll every 500ms
          } else {
            console.warn(`Polling timeout for tool call ${toolCallId} after ${maxAttempts} attempts`);
            
            // Create a failed result message
            const failedResultMessage: ToolResultMessage = {
              type: 'tool-result',
              toolCallId,
              toolName,
              result: { error: 'Timeout waiting for tool result' },
              isSuccess: false,
              timestamp: new Date()
            };

            setMessages(prevMessages => {
              return prevMessages.map(msg => {
                if (msg.type === 'tool-call' && msg.toolCallId === toolCallId) {
                  return failedResultMessage;
                }
                return msg;
              });
            });
          }
        } catch (error) {
          console.error(`Error polling for tool result ${toolCallId}:`, error);
          
          // Continue polling on network errors (but not indefinitely)
          if (attempts < maxAttempts) {
            setTimeout(poll, 500);
          } else {
            // Create an error result message
            const errorResultMessage: ToolResultMessage = {
              type: 'tool-result',
              toolCallId,
              toolName,
              result: { error: 'Failed to fetch tool result' },
              isSuccess: false,
              timestamp: new Date()
            };

            setMessages(prevMessages => {
              return prevMessages.map(msg => {
                if (msg.type === 'tool-call' && msg.toolCallId === toolCallId) {
                  return errorResultMessage;
                }
                return msg;
              });
            });
          }
        }
      };

      // Start polling immediately
      setTimeout(poll, 100); // Small initial delay to give the server time to process
    };

    return () => {
      // Cleanup: stop call and remove listeners if component unmounts
      if (vapiRef.current) {
        vapiRef.current.stop();
      }
      vapiInstance.removeAllListeners();
    };
  }, []); // Empty dependency array ensures this runs once on mount

  const start = () => {
    if (vapiRef.current && vapiAssistantId) {
      console.log('Starting demo call with assistant:', vapiAssistantId);
      setCallStatus('connecting');
      vapiRef.current.start(vapiAssistantId);
    }
  };

  const stop = () => {
    if (vapiRef.current) {
      console.log('Stopping demo call');
      setCallStatus('ended');
      vapiRef.current.stop();
    }
  };

  return {
    messages,
    isCalling,
    isUserSpeaking,
    callStatus,
    start,
    stop
  };
}
