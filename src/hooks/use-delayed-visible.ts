import { useEffect, useState } from "react"

// Spec §4.3 delayed-skeleton standard: a loading affordance appears only
// after a short grace period, so cache hits and fast loads render straight
// into content with no skeleton flash.
export function useDelayedVisible(active: boolean, delayMs = 150): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return visible
}
