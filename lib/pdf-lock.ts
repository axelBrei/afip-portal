// Serializes PDF generation to prevent concurrent Chromium instances from
// competing for system resources (ProtocolError: Network.enable timed out).
let busy = false
const waiters: Array<() => void> = []

export function acquirePdfLock(): Promise<() => void> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (!busy) {
        busy = true
        resolve(() => {
          busy = false
          const next = waiters.shift()
          if (next) next()
        })
      } else {
        waiters.push(tryAcquire)
      }
    }
    tryAcquire()
  })
}
