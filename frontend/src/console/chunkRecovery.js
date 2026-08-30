// A deploy replaces every hashed chunk file. A console left open across one
// fails to fetch a lazily loaded view the moment somebody opens that tab, and
// without this the whole application is replaced by a stack trace. Reloading
// once picks up the new build; the flag stops that becoming a loop when the
// failure is something other than a stale chunk.
const KEY = 'pt.chunk.reloaded'

export function reloadOnStaleChunk(err) {
  try {
    if (!sessionStorage.getItem(KEY)) {
      sessionStorage.setItem(KEY, '1')
      window.location.reload()
      return new Promise(() => {})  // never settles: the reload takes over
    }
  } catch { /* storage blocked: fall through to the boundary */ }
  throw err
}

export function clearStaleChunkFlag() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}
