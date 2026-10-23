// Generic builders for the temporary backend. The production application has
// its own generated module and must never import this one.
export {
  internalMutationGeneric as internalMutation,
  internalQueryGeneric as internalQuery,
} from 'convex/server';
