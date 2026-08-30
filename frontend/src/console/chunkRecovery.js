// A deploy replaces every hashed chunk file. A console left open across one
// fails to fetch a lazily loaded view the moment somebody opens that tab, and
// without this the whole application is replaced by a stack trace. Reloading
// once picks up the new build; the flag stops that becoming a loop when the
// failure is something other than a stale chunk.
const KEY = 'pt.chunk.reloaded'
// The reload is only a remedy for the deploy that just happened. Past that
// window a repeat failure is something else, and looping on it would trap the
// user; the boundary is the honest outcome.
const WINDOW_MS = 60_000

export function reloadOnStaleChunk(err) {
  try {
    const at = Number(sessionStorage.getItem(KEY))
    if (!at || Date.now() - at > WINDOW_MS) {
      sessionStorage.setItem(KEY, String(Date.now()))
      window.location.reload()
      return new Promise(() => {})  // never settles: the reload takes over
    }
  } catch { /* storage blocked: fall through to the boundary */ }
  throw err
}

// Cleared by the lazy view itself once it has actually mounted. Clearing on
// app mount proved nothing: the chunk is not fetched until someone opens the
// tab, so the flag was always already gone by the time it failed.
export function clearStaleChunkFlag() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}
