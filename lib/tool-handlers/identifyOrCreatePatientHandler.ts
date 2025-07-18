import { prisma } from "@/lib/prisma";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import { spellOut, formatPhoneNumberForReadback } from "@/lib/utils/text-helpers";
import type { ConversationState, HandlerResult } from "@/types/vapi";

interface IdentifyOrCreatePatientArgs {
  fullName?: string;
  dob?: string;
  phone?: string;
  email?: string;
  userConfirmation?: string;
}

interface NexHealthPatient {
  id: number;
  first_name: string;
  last_name: string;
  dob?: string;
  email?: string;
  phone?: string;
}



// Helper function to parse full name
function parseFullName(fullName: string): { firstName: string; lastName: string } | null {
  try {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2) {
      return null;
    }
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return { firstName, lastName };
  } catch (error) {
    console.error('[IdentifyOrCreatePatientHandler] Error parsing name:', error);
    return null;
  }
}

export async function handleIdentifyOrCreatePatient(
  currentState: ConversationState,
  toolArguments: IdentifyOrCreatePatientArgs,
  toolId: string
): Promise<HandlerResult> {
  console.log(`[IdentifyOrCreatePatientHandler] Processing with status: ${currentState.patientDetails.status}`, toolArguments);
  
  try {
    if (!currentState.practiceId) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Practice configuration not found."
        },
        newState: currentState
      };
    }

    // Get practice configuration for NexHealth API calls
    const practice = await prisma.practice.findUnique({
      where: { id: currentState.practiceId },
      select: {
        nexhealthSubdomain: true,
        nexhealthLocationId: true
      }
    });

    if (!practice?.nexhealthSubdomain || !practice?.nexhealthLocationId) {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: "Practice NexHealth configuration not found."
        },
        newState: currentState
      };
    }

    const newState = { ...currentState };
    const status = currentState.patientDetails.status;

    switch (status) {
      case 'IDENTIFICATION_NEEDED': {
        console.log('[IdentifyOrCreatePatientHandler] Starting patient identification process');
        newState.patientDetails.status = 'INFO_GATHERING';
        newState.patientDetails.infoToAskNext = 'dob';
        
        return {
          toolResponse: {
            toolCallId: toolId,
            result: "To get started, could I get your first and last name, please?"
          },
          newState
        };
      }

      case 'INFO_GATHERING': {
        console.log('[IdentifyOrCreatePatientHandler] Gathering patient information');
        
        const infoToAskNext = currentState.patientDetails.infoToAskNext;
        
        // Handle incoming information based on what we're expecting
        if (infoToAskNext === 'dob' && toolArguments.fullName) {
          // User provided full name, now confirm spelling
          const parsedName = parseFullName(toolArguments.fullName);
          if (!parsedName) {
            return {
              toolResponse: {
                toolCallId: toolId,
                result: "I didn't catch that clearly. Could you please tell me your first and last name again?"
              },
              newState: currentState
            };
          }
          newState.patientDetails.firstName = parsedName.firstName;
          newState.patientDetails.lastName = parsedName.lastName;
          newState.patientDetails.infoToAskNext = 'confirmName';
          
          const firstNameSpelled = spellOut(parsedName.firstName);
          const lastNameSpelled = spellOut(parsedName.lastName);
          
          return {
            toolResponse: {
              toolCallId: toolId,
              result: `Got it. Just to confirm the spelling, I have ${firstNameSpelled}... ${lastNameSpelled}. Is that correct?`
            },
            newState
          };
        }
        
        if (infoToAskNext === 'confirmName') {
          // User confirmed or corrected name spelling
          const userResponse = (toolArguments.userConfirmation || '').toLowerCase();
          const confirmationWords = ['yes', 'correct', 'right', 'that\'s right', 'yep', 'yeah'];
          const isConfirmed = confirmationWords.some(word => userResponse.includes(word));
          
          if (isConfirmed) {
            // Name confirmed, now search for patient
            if (!newState.patientDetails.firstName || !newState.patientDetails.lastName) {
              return {
                toolResponse: {
                  toolCallId: toolId,
                  result: "I'm sorry, there was an issue with the name information. Could you please tell me your first and last name again?"
                },
                newState: { ...currentState, patientDetails: { ...currentState.patientDetails, infoToAskNext: 'dob' } }
              };
            }
            
            newState.patientDetails.status = 'SEARCHING';
            
            try {
              console.log(`[IdentifyOrCreatePatientHandler] Searching for patient: ${newState.patientDetails.firstName} ${newState.patientDetails.lastName}`);
              
              // Search for patient in NexHealth
              const searchParams = {
                location_id: practice.nexhealthLocationId,
                first_name: newState.patientDetails.firstName,
                last_name: newState.patientDetails.lastName
              };

              const response = await fetchNexhealthAPI(
                '/patients',
                practice.nexhealthSubdomain,
                searchParams
              );

              let patients: NexHealthPatient[] = [];
              
              // Handle different response structures
              if (Array.isArray(response)) {
                patients = response;
              } else if (response?.data && Array.isArray(response.data)) {
                patients = response.data;
              } else if (response?.patients && Array.isArray(response.patients)) {
                patients = response.patients;
              }

              console.log(`[IdentifyOrCreatePatientHandler] Found ${patients.length} matching patients`);

              if (patients.length === 1) {
                // Perfect match - patient found
                newState.patientDetails.status = 'IDENTIFIED';
                newState.patientDetails.nexhealthPatientId = patients[0].id;
                newState.patientDetails.infoToAskNext = null;
                
                return {
                  toolResponse: {
                    toolCallId: toolId,
                    result: `Perfect, I've found your file, ${newState.patientDetails.firstName}.`
                  },
                  newState
                };
              } else if (patients.length === 0) {
                // No matches - need to create new patient
                newState.patientDetails.status = 'CREATING';
                newState.patientDetails.infoToAskNext = 'phone';
                
                return {
                  toolResponse: {
                    toolCallId: toolId,
                    result: "Okay, it looks like you're new here, welcome! To create your file, what's the best phone number to reach you?"
                  },
                  newState
                };
              } else {
                // Multiple matches - security issue
                newState.patientDetails.status = 'FAILED_MULTIPLE_MATCHES';
                newState.patientDetails.infoToAskNext = null;
                
                return {
                  toolResponse: {
                    toolCallId: toolId,
                    result: "For security reasons, I found multiple patients with that name. Please call our office directly so we can verify your identity and assist you properly."
                  },
                  newState
                };
              }
            } catch (error) {
              console.error('[IdentifyOrCreatePatientHandler] Error searching for patient:', error);
              newState.patientDetails.status = 'FAILED_MULTIPLE_MATCHES';
              
              return {
                toolResponse: {
                  toolCallId: toolId,
                  result: "I'm having trouble accessing our patient database right now. Please call our office directly and we'll be happy to help you schedule your appointment."
                },
                newState
              };
            }
          } else {
            // Name not confirmed, ask again
            newState.patientDetails.firstName = undefined;
            newState.patientDetails.lastName = undefined;
            newState.patientDetails.infoToAskNext = 'dob';
            
            return {
              toolResponse: {
                toolCallId: toolId,
                result: "No problem. Could you please tell me your first and last name again?"
              },
              newState
            };
          }
        }

        break;
      }

      case 'CREATING': {
        console.log('[IdentifyOrCreatePatientHandler] Creating new patient');
        
        const infoToAskNext = currentState.patientDetails.infoToAskNext;
        
        // Handle phone number collection and confirmation
        if (infoToAskNext === 'phone' && toolArguments.phone) {
          newState.patientDetails.phone = toolArguments.phone;
          newState.patientDetails.infoToAskNext = 'confirmPhone';
          
          const formattedPhone = formatPhoneNumberForReadback(toolArguments.phone);
          return {
            toolResponse: {
              toolCallId: toolId,
              result: `Okay, I have ${formattedPhone}. Is that correct?`
            },
            newState
          };
        }
        
        if (infoToAskNext === 'confirmPhone') {
          const userResponse = (toolArguments.userConfirmation || '').toLowerCase();
          const confirmationWords = ['yes', 'correct', 'right', 'that\'s right', 'yep', 'yeah'];
          const isConfirmed = confirmationWords.some(word => userResponse.includes(word));
          
          if (isConfirmed) {
            newState.patientDetails.infoToAskNext = 'email';
            return {
              toolResponse: {
                toolCallId: toolId,
                result: "Perfect! And what's your email address?"
              },
              newState
            };
          } else {
            newState.patientDetails.phone = undefined;
            newState.patientDetails.infoToAskNext = 'phone';
            return {
              toolResponse: {
                toolCallId: toolId,
                result: "No problem. What's the best phone number to reach you?"
              },
              newState
            };
          }
        }
        
        // Handle email collection and confirmation
        if (infoToAskNext === 'email' && toolArguments.email) {
          newState.patientDetails.email = toolArguments.email;
          newState.patientDetails.infoToAskNext = 'confirmEmail';
          
          // Parse email for confirmation
          const email = toolArguments.email;
          const atIndex = email.indexOf('@');
          if (atIndex === -1) {
            return {
              toolResponse: {
                toolCallId: toolId,
                result: "That doesn't look like a valid email address. Could you please provide your email again?"
              },
              newState: { ...currentState, patientDetails: { ...currentState.patientDetails, infoToAskNext: 'email' } }
            };
          }
          
          const username = email.substring(0, atIndex);
          const domain = email.substring(atIndex + 1);
          const usernameSpelled = spellOut(username);
          
          return {
            toolResponse: {
              toolCallId: toolId,
              result: `Thank you. To make sure your appointment confirmations get to you, I'm going to spell that back. I have: ${usernameSpelled}... at... ${domain}. Is that all correct?`
            },
            newState
          };
        }
        
        if (infoToAskNext === 'confirmEmail') {
          const userResponse = (toolArguments.userConfirmation || '').toLowerCase();
          const confirmationWords = ['yes', 'correct', 'right', 'that\'s right', 'yep', 'yeah'];
          const isConfirmed = confirmationWords.some(word => userResponse.includes(word));
          
          if (isConfirmed) {
            // We have all required information, create the patient
            if (newState.patientDetails.firstName && newState.patientDetails.lastName && 
                newState.patientDetails.phone && newState.patientDetails.email) {
              try {
                console.log('[IdentifyOrCreatePatientHandler] Creating patient in NexHealth');
                
                const createPatientBody = {
                  patient: {
                    first_name: newState.patientDetails.firstName,
                    last_name: newState.patientDetails.lastName,
                    email: newState.patientDetails.email,
                    phone: newState.patientDetails.phone,
                    location_id: practice.nexhealthLocationId
                  }
                };

                const response = await fetchNexhealthAPI(
                  '/patients',
                  practice.nexhealthSubdomain,
                  { location_id: practice.nexhealthLocationId },
                  'POST',
                  createPatientBody
                );

                let createdPatient: NexHealthPatient | null = null;
                
                // Handle different response structures
                if (response?.data) {
                  createdPatient = response.data;
                } else if (response?.patient) {
                  createdPatient = response.patient;
                }

                if (createdPatient && createdPatient.id) {
                  newState.patientDetails.nexhealthPatientId = createdPatient.id;
                  newState.patientDetails.infoToAskNext = 'insurance';
                  
                  return {
                    toolResponse: {
                      toolCallId: toolId,
                      result: `Great, you're all set up in our system. Before we find a time, do you have dental insurance you'd like to add to your file?`
                    },
                    newState
                  };
                } else {
                  throw new Error('Invalid response structure from patient creation');
                }
              } catch (error) {
                console.error('[IdentifyOrCreatePatientHandler] Error creating patient:', error);
                newState.patientDetails.status = 'FAILED_CREATION';
                
                return {
                  toolResponse: {
                    toolCallId: toolId,
                    result: "I'm having trouble creating your patient file right now. Please call our office directly and we'll be happy to help you get set up and schedule your appointment."
                  },
                  newState
                };
              }
            }
          } else {
            newState.patientDetails.email = undefined;
            newState.patientDetails.infoToAskNext = 'email';
            return {
              toolResponse: {
                toolCallId: toolId,
                result: "No problem. What's your email address?"
              },
              newState
            };
          }
        }
        
        // Handle cases where we need to ask for missing information
        if (infoToAskNext === 'phone' && !toolArguments.phone) {
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "What's the best phone number to reach you?"
            },
            newState
          };
        }
        
        if (infoToAskNext === 'email' && !toolArguments.email) {
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "What's your email address?"
            },
            newState
          };
        }
        
        // Handle insurance collection
        if (infoToAskNext === 'insurance') {
          const userResponse = (toolArguments.userConfirmation || toolArguments.fullName || toolArguments.phone || toolArguments.email || '').toLowerCase();
          const hasInsuranceKeywords = ['yes', 'yeah', 'yep', 'i do', 'i have', 'sure'];
          const noInsuranceKeywords = ['no', 'nope', 'don\'t have', 'no insurance', 'not right now'];
          
          const hasInsurance = hasInsuranceKeywords.some(keyword => userResponse.includes(keyword));
          const noInsurance = noInsuranceKeywords.some(keyword => userResponse.includes(keyword));
          
          if (hasInsurance) {
            newState.patientDetails.infoToAskNext = 'insuranceProvider';
            return {
              toolResponse: {
                toolCallId: toolId,
                result: "Great! What's the name of your insurance provider?"
              },
              newState
            };
          } else if (noInsurance) {
            // Complete the patient identification process
            newState.patientDetails.status = 'IDENTIFIED';
            newState.patientDetails.infoToAskNext = null;
            return {
              toolResponse: {
                toolCallId: toolId,
                result: `Perfect! I've created your patient file, ${newState.patientDetails.firstName}. Welcome to our practice!`
              },
              newState
            };
          } else {
            // Unclear response, ask again
            return {
              toolResponse: {
                toolCallId: toolId,
                result: "Do you have dental insurance you'd like to add to your file? Just say yes or no."
              },
              newState
            };
          }
        }
        
        if (infoToAskNext === 'insuranceProvider' && toolArguments.fullName) {
          newState.patientDetails.insuranceProvider = toolArguments.fullName;
          newState.patientDetails.infoToAskNext = 'insuranceMemberId';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "Thank you! And what's your member ID or policy number?"
            },
            newState
          };
        }
        
        if (infoToAskNext === 'insuranceMemberId' && (toolArguments.fullName || toolArguments.phone)) {
          const memberId = toolArguments.fullName || toolArguments.phone || '';
          newState.patientDetails.insuranceMemberId = memberId;
          newState.patientDetails.status = 'IDENTIFIED';
          newState.patientDetails.infoToAskNext = null;
          
          return {
            toolResponse: {
              toolCallId: toolId,
              result: `Perfect! I've added your ${newState.patientDetails.insuranceProvider} insurance information to your file, ${newState.patientDetails.firstName}. Welcome to our practice!`
            },
            newState
          };
        }
        
        // Handle missing information requests
        if (infoToAskNext === 'insuranceProvider' && !toolArguments.fullName) {
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "What's the name of your insurance provider?"
            },
            newState
          };
        }
        
        if (infoToAskNext === 'insuranceMemberId' && !toolArguments.fullName && !toolArguments.phone) {
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "What's your member ID or policy number?"
            },
            newState
          };
        }

        break;
      }

      case 'IDENTIFIED': {
        return {
          toolResponse: {
            toolCallId: toolId,
            result: "I already have your information on file. Let's proceed with scheduling your appointment."
          },
          newState: currentState
        };
      }

      case 'FAILED_MULTIPLE_MATCHES':
      case 'FAILED_CREATION': {
        return {
          toolResponse: {
            toolCallId: toolId,
            result: "Please call our office directly for assistance. Our staff will be happy to help you."
          },
          newState: currentState
        };
      }

      default: {
        console.error(`[IdentifyOrCreatePatientHandler] Unknown status: ${status}`);
        return {
          toolResponse: {
            toolCallId: toolId,
            error: `Unknown patient identification status: ${status}`
          },
          newState: currentState
        };
      }
    }

    // Default fallback
    return {
      toolResponse: {
        toolCallId: toolId,
        result: "Let me help you with your information. What can you tell me?"
      },
      newState
    };

  } catch (error) {
    console.error(`[IdentifyOrCreatePatientHandler] Error processing patient identification:`, error);
    return {
      toolResponse: {
        toolCallId: toolId,
        error: "Error processing patient identification."
      },
      newState: currentState
    };
  }
} 