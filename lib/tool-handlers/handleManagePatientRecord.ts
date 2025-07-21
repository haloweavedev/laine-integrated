import { spellOut, formatPhoneNumberForReadback } from "@/lib/utils/text-helpers";
import { generateNextQuestion, generateConfirmationSummary } from "@/lib/ai/patientDialogueHelper";
import { normalizeDateWithAI } from "@/lib/ai/slotHelper";
import { prisma } from "@/lib/prisma";
import { fetchNexhealthAPI } from "@/lib/nexhealth";
import type { ConversationState, HandlerResult } from "@/types/vapi";

// Helper function to parse full name
function parseFullName(fullName: string): { firstName: string; lastName: string } | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

interface ManagePatientRecordArgs {
  fullName?: string;
  dob?: string;
  phone?: string;
  email?: string;
  userConfirmation?: string;
}

interface NexHealthPatient {
  id: number;
  bio?: {
    date_of_birth?: string;
    phone_number?: string;
  };
  first_name?: string;
  last_name?: string;
  email?: string;
}

export async function handleManagePatientRecord(
  currentState: ConversationState,
  toolArguments: ManagePatientRecordArgs,
  toolId: string
): Promise<HandlerResult> {
  const newState = JSON.parse(JSON.stringify(currentState)); // Deep clone for safety

  switch (newState.patientDetails.status) {
    case 'AWAITING_IDENTIFIER': {
      // This is the very first time this tool is called in a conversation.
      // We must ask for the name.
      newState.patientDetails.status = 'COLLECTING_NEW_PATIENT_INFO';
      newState.patientDetails.nextInfoToCollect = 'name';
      return {
        toolResponse: {
          toolCallId: toolId,
          result: "To get started, could I get your first and last name, please?<user_response_awaited>"
        },
        newState
      };
    }

    case 'COLLECTING_NEW_PATIENT_INFO': {
      // Main logic for gathering data will go here in subsequent subphases.
      // For now, let's handle the first step: collecting the name.
      if (newState.patientDetails.nextInfoToCollect === 'name') {
        if (!toolArguments.fullName) {
          // If the AI calls the tool without a name, we must ask again.
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "I didn't catch that. Could you please provide your first and last name?<user_response_awaited>"
            },
            newState: currentState // Return original state
          };
        }

        const parsedName = parseFullName(toolArguments.fullName);
        if (!parsedName) {
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "I need both a first and last name. Could you please provide your full name?<user_response_awaited>"
            },
            newState: currentState // Return original state
          };
        }

        newState.patientDetails.collectedInfo.firstName = parsedName.firstName;
        newState.patientDetails.collectedInfo.lastName = parsedName.lastName;
        newState.patientDetails.nextInfoToCollect = 'confirmName';

        return {
          toolResponse: {
            toolCallId: toolId,
            result: `Got it. To confirm the spelling, I have ${spellOut(parsedName.firstName)}... ${spellOut(parsedName.lastName)}. Is that correct?<user_response_awaited>`
          },
          newState
        };
      }

      if (newState.patientDetails.nextInfoToCollect === 'confirmName') {
        const userResponse = (toolArguments.userConfirmation || '').toLowerCase();
        const isConfirmed = userResponse.includes('yes') || userResponse.includes('correct') || userResponse.includes('right');

        if (isConfirmed) {
          newState.patientDetails.nextInfoToCollect = 'dob';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: `${await generateNextQuestion(newState)}<user_response_awaited>`
            },
            newState
          };
        } else {
          // Name not confirmed, ask again.
          newState.patientDetails.collectedInfo.firstName = undefined;
          newState.patientDetails.collectedInfo.lastName = undefined;
          newState.patientDetails.nextInfoToCollect = 'name';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "My apologies. Could you please tell me your first and last name again?<user_response_awaited>"
            },
            newState
          };
        }
      }

      if (newState.patientDetails.nextInfoToCollect === 'dob') {
        if (!toolArguments.dob) {
          return {
            toolResponse: { toolCallId: toolId, result: "I didn't catch that. What is your date of birth?<user_response_awaited>" },
            newState: currentState
          };
        }
        
        // Normalize the date using AI
        const normalizedDate = await normalizeDateWithAI(toolArguments.dob, "America/Chicago");
        if (!normalizedDate) {
          return {
            toolResponse: { 
              toolCallId: toolId, 
              result: "I'm sorry, I didn't understand that date format. Could you please provide your date of birth again, like 'June 1st, 1990'?<user_response_awaited>" 
            },
            newState: currentState
          };
        }
        
        newState.patientDetails.collectedInfo.dob = normalizedDate;
        newState.patientDetails.nextInfoToCollect = 'phone';
        return {
          toolResponse: {
            toolCallId: toolId,
            result: `${await generateNextQuestion(newState)}<user_response_awaited>`
          },
          newState
        };
      }

      if (newState.patientDetails.nextInfoToCollect === 'phone') {
        if (!toolArguments.phone) {
          return {
            toolResponse: { toolCallId: toolId, result: "I didn't catch that. What is your phone number?<user_response_awaited>" },
            newState: currentState
          };
        }
        newState.patientDetails.collectedInfo.phone = toolArguments.phone;
        newState.patientDetails.nextInfoToCollect = 'confirmPhone';
        return {
          toolResponse: {
            toolCallId: toolId,
            result: `Okay, I have ${formatPhoneNumberForReadback(toolArguments.phone)}. Is that correct?<user_response_awaited>`
          },
          newState
        };
      }

      if (newState.patientDetails.nextInfoToCollect === 'confirmPhone') {
        const userResponse = (toolArguments.userConfirmation || '').toLowerCase();
        const isConfirmed = userResponse.includes('yes') || userResponse.includes('correct') || userResponse.includes('right');

        if (isConfirmed) {
          newState.patientDetails.nextInfoToCollect = 'email';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: `${await generateNextQuestion(newState)}<user_response_awaited>`
            },
            newState
          };
        } else {
          newState.patientDetails.collectedInfo.phone = undefined;
          newState.patientDetails.nextInfoToCollect = 'phone';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "No problem. What is the correct phone number?<user_response_awaited>"
            },
            newState
          };
        }
      }

      if (newState.patientDetails.nextInfoToCollect === 'email') {
        if (!toolArguments.email) {
          return {
            toolResponse: { toolCallId: toolId, result: "I didn't catch that. What is your email address?<user_response_awaited>" },
            newState: currentState
          };
        }
        newState.patientDetails.collectedInfo.email = toolArguments.email;
        newState.patientDetails.nextInfoToCollect = 'confirmEmail';

        const email = toolArguments.email;
        const atIndex = email.indexOf('@');
        const username = atIndex !== -1 ? email.substring(0, atIndex) : email;
        const domain = atIndex !== -1 ? email.substring(atIndex + 1) : "";

        return {
          toolResponse: {
            toolCallId: toolId,
            result: `Got it. To make sure I have it right, that's ${spellOut(username)} at ${domain}. Is that correct?<user_response_awaited>`
          },
          newState
        };
      }

      if (newState.patientDetails.nextInfoToCollect === 'confirmEmail') {
        const userResponse = (toolArguments.userConfirmation || '').toLowerCase();
        const isConfirmed = userResponse.includes('yes') || userResponse.includes('correct') || userResponse.includes('right');

        if (isConfirmed) {
          // This is the end of the collection phase.
          newState.patientDetails.status = 'CONFIRMING_COLLECTED_INFO';
          newState.patientDetails.nextInfoToCollect = null;
          // The response for this will be handled in the next subphase.
          // For now, just fall through.
        } else {
          newState.patientDetails.collectedInfo.email = undefined;
          newState.patientDetails.nextInfoToCollect = 'email';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "My apologies. What is the correct email address?<user_response_awaited>"
            },
            newState
          };
        }
      }
      // This should not happen if logic is correct
      return {
        toolResponse: { toolCallId: toolId, error: "Unexpected state in COLLECTING_NEW_PATIENT_INFO" },
        newState: currentState
      };
    }

    case 'CONFIRMING_COLLECTED_INFO': {
      // Check if user is providing confirmation to our summary
      if (toolArguments.userConfirmation) {
        const userResponse = (toolArguments.userConfirmation || '').toLowerCase();
        const isConfirmed = userResponse.includes('yes') || userResponse.includes('correct') || userResponse.includes('right');

        if (isConfirmed) {
          newState.patientDetails.status = 'SEARCHING_EHR';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "Perfect! Let me just check that in our system for you."
            },
            newState
          };
        } else {
          // Not confirmed, restart the process
          newState.patientDetails.status = 'AWAITING_IDENTIFIER';
          newState.patientDetails.collectedInfo = {};
          newState.patientDetails.nextInfoToCollect = 'name';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "I'm sorry to hear that. Let's start over to make sure we get it right. Could you please tell me your first and last name again?<user_response_awaited>"
            },
            newState
          };
        }
      } else {
        // First time in this state - generate confirmation summary
        return {
          toolResponse: {
            toolCallId: toolId,
            result: `${await generateConfirmationSummary(newState)}<user_response_awaited>`
          },
          newState
        };
      }
    }

    case 'SEARCHING_EHR': {
      try {
        // Fetch the practice details from Prisma
        const practice = await prisma.practice.findUnique({
          where: { id: newState.practiceId },
          select: {
            nexhealthSubdomain: true,
            nexhealthLocationId: true
          }
        });

        if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "I'm sorry, there seems to be an issue with our system configuration. Please call our office directly to schedule your appointment."
            },
            newState: currentState
          };
        }

        // Get the full name from the state
        const fullName = `${newState.patientDetails.collectedInfo.firstName} ${newState.patientDetails.collectedInfo.lastName}`.trim();
        
        // Construct the search parameters for the NexHealth API
        const searchParams = { name: fullName };

        // Call the NexHealth API to search for patients
        const searchResponse = await fetchNexhealthAPI('/patients', practice.nexhealthSubdomain, searchParams);
        
        // Parse the response correctly: response.data.patients
        const foundPatients: NexHealthPatient[] = searchResponse?.data?.patients || [];
        
        console.log(`[Patient Search] Found ${foundPatients.length} patients with name "${fullName}"`);

        // Get the patient's DOB from the state (should be in 'YYYY-MM-DD' format)
        const patientDob = newState.patientDetails.collectedInfo.dob;

        // Filter patients by DOB - the patient object from the API has DOB at patient.bio.date_of_birth
        const matchingPatients = foundPatients.filter(patient => 
          patient.bio && patient.bio.date_of_birth === patientDob
        );

        console.log(`[Patient Search] After DOB filtering: ${matchingPatients.length} patients match both name and DOB`);

        // Handle different scenarios based on number of matching patients
        if (matchingPatients.length > 1) {
          // Multiple matches - security issue
          newState.patientDetails.status = 'FAILED';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "For security, because I found multiple records with that name and date of birth, I can't proceed with booking online. Please call our office directly, and our staff will be happy to assist you."
            },
            newState
          };
        } else if (matchingPatients.length === 1) {
          // Exactly one match - patient found
          newState.patientDetails.status = 'IDENTIFIED';
          newState.patientDetails.nexhealthPatientId = matchingPatients[0].id;
          return {
            toolResponse: {
              toolCallId: toolId,
              result: `Perfect, I've found your file in our system, ${newState.patientDetails.collectedInfo.firstName}.`
            },
            newState,
            nextTool: {
              toolName: 'checkAvailableSlots',
              toolArguments: {}
            }
          };
        } else {
          // No matches found - need to create new patient
          newState.patientDetails.status = 'CREATING_IN_EHR';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "Okay, it looks like you're new here. Let me create your patient file."
            },
            newState
          };
        }

      } catch (error) {
        console.error("[Patient Search] Error searching NexHealth:", error);
        return {
          toolResponse: {
            toolCallId: toolId,
            result: "I'm sorry, I'm having trouble accessing our patient records right now. Please call our office directly to schedule your appointment."
          },
          newState: currentState
        };
      }
    }

    case 'CREATING_IN_EHR': {
      try {
        // Fetch practice details
        const practice = await prisma.practice.findUnique({
          where: { id: newState.practiceId },
          select: {
            nexhealthSubdomain: true,
            nexhealthLocationId: true
          }
        });

        if (!practice || !practice.nexhealthSubdomain || !practice.nexhealthLocationId) {
          newState.patientDetails.status = 'FAILED';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "I'm sorry, there seems to be an issue with our system configuration. Please call our office directly to schedule your appointment."
            },
            newState
          };
        }

        // Construct the createPatientBody
        const createPatientBody = {
          patient: {
            first_name: newState.patientDetails.collectedInfo.firstName,
            last_name: newState.patientDetails.collectedInfo.lastName,
            email: newState.patientDetails.collectedInfo.email,
            bio: {
              date_of_birth: newState.patientDetails.collectedInfo.dob,
              phone_number: newState.patientDetails.collectedInfo.phone
            }
          }
        };

        // Call the NexHealth API to create the patient
        const createResponse = await fetchNexhealthAPI(
          '/patients', 
          practice.nexhealthSubdomain, 
          { location_id: practice.nexhealthLocationId }, 
          'POST', 
          createPatientBody
        );

        // Parse the new patient ID from the response
        const newPatientId = createResponse?.data?.id || createResponse?.patient?.id;
        
        if (!newPatientId) {
          console.error("[Patient Creation] Invalid response structure:", createResponse);
          newState.patientDetails.status = 'FAILED';
          return {
            toolResponse: {
              toolCallId: toolId,
              result: "I'm sorry, there was an issue creating your patient record. Please call our office directly to schedule your appointment."
            },
            newState
          };
        }

        // Success - update state
        newState.patientDetails.status = 'IDENTIFIED';
        newState.patientDetails.nexhealthPatientId = newPatientId;
        
        return {
          toolResponse: {
            toolCallId: toolId,
            result: `Great, you're all set up in our system, ${newState.patientDetails.collectedInfo.firstName}. Welcome to the practice!`
          },
          newState,
          nextTool: {
            toolName: 'checkAvailableSlots',
            toolArguments: {}
          }
        };

      } catch (error) {
        console.error("[Patient Creation] Error creating patient in NexHealth:", error);
        newState.patientDetails.status = 'FAILED';
        return {
          toolResponse: {
            toolCallId: toolId,
            result: "I'm sorry, there was an issue creating your patient record. Please call our office directly to schedule your appointment."
          },
          newState
        };
      }
    }

    case 'IDENTIFIED': {
      // Terminal state - patient has been identified and is ready for scheduling
      return {
        toolResponse: {
          toolCallId: toolId,
          result: `You're all set, ${newState.patientDetails.collectedInfo.firstName}. Let's find you an appointment time.`
        },
        newState
      };
    }

    case 'FAILED': {
      // Terminal state - process failed, direct user to call office
      return {
        toolResponse: {
          toolCallId: toolId,
          result: "Please call our office directly and our staff will be happy to help you schedule your appointment."
        },
        newState
      };
    }

    default: {
      return {
        toolResponse: {
          toolCallId: toolId,
          error: `Unknown status in handleManagePatientRecord: ${newState.patientDetails.status}`
        },
        newState: currentState
      };
    }
  }
} 