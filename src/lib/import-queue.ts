/**
 * A zip dropped on the desktop, waiting for the Import window to check it.
 * The window is lazy-loaded, so the file waits here until it subscribes.
 */
let pending: File | null = null
const listeners = new Set<() => void>()

export function queueZip(file: File) {
  pending = file
  for (const l of listeners) l()
}

/** Take the waiting zip, if any (it is given out once). */
export function takeZip() {
  const file = pending
  pending = null
  return file
}

export function onZipQueued(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
