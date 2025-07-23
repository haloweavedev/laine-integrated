import merge from 'lodash.merge';
import type { ConversationState } from '@/types/vapi';

/**
 * Deeply merges a partial state update into the current conversation state.
 * This creates a new state object and ensures no data is accidentally overwritten.
 * @param currentState The original conversation state.
 * @param partialNewState A partial object representing the fields to update.
 * @returns A new, complete ConversationState object.
 */
export function mergeState(
  currentState: ConversationState,
  partialNewState: DeepPartial<ConversationState>
): ConversationState {
  // Use lodash.merge to perform a deep merge.
  // We pass an empty object as the first argument to ensure the original state is not mutated.
  return merge({}, currentState, partialNewState);
}

// Helper type to allow for deep partial updates
type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T; 