/**
 * A fetch that gives up instead of hanging. A stuck request to the database would otherwise hold a page
 * open until the platform's own limit; failing fast lets the app retry or show a clear message.
 */
export const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(12000)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(input, { ...init, signal })
}
