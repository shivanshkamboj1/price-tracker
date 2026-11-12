import { Agent, interceptors, type Dispatcher } from 'undici';

/**
 * Explicit dispatchers for every outbound request.
 *
 * Without a `dispatcher` option, the undici package falls back to the process-wide
 * global dispatcher — and newer Node releases install their own bundled undici
 * (v7+) there. That version rejects the per-request `maxRedirections` option, so
 * requests failed with UND_ERR_INVALID_ARG depending on the Node version. Owning
 * the agent keeps behaviour tied to the undici version in package.json, and the
 * redirect interceptor is the API both undici 6 and 7 support.
 */
export const httpAgent: Dispatcher = new Agent();

/** Follows up to `max` redirects; built once per limit and reused. */
const redirecting = new Map<number, Dispatcher>();

export function followRedirects(max: number): Dispatcher {
  let dispatcher = redirecting.get(max);
  if (!dispatcher) {
    dispatcher = httpAgent.compose(interceptors.redirect({ maxRedirections: max }));
    redirecting.set(max, dispatcher);
  }
  return dispatcher;
}
