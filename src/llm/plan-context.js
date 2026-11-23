// Who is running, and which conversation this belongs to.
//
// generateText() is called from a dozen places inside a run and none of them
// carry a user or a conversation id. Threading two more arguments through all of
// them would touch every stage for the benefit of one provider, so the context
// is ambient: set once where a run starts, read only by the plans provider.
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/** Run `fn` with the plan context in scope for everything it awaits. */
export const withPlanContext = (context, fn) => storage.run(context, fn);

/** The current context, or an empty object outside a run. */
export const planContext = () => storage.getStore() || {};
