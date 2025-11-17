import { useEffect } from 'react'

/**
 * Hook to prevent body scrolling when a modal is open.
 * Uses position: fixed trick on iOS to prevent scroll bounce.
 */
export function useBodyScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return

    const body = document.body
    const html = document.documentElement

    // Store the current scroll position
    const scrollY = window.scrollY

    // Prevent body scroll
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    body.style.overflow = 'hidden'

    // Also prevent html scroll (for better compatibility)
    html.style.overflow = 'hidden'

    return () => {
      // Restore body scroll
      body.style.position = ''
      body.style.top = ''
      body.style.width = ''
      body.style.overflow = ''
      html.style.overflow = ''

      // Restore scroll position
      window.scrollTo(0, scrollY)
    }
  }, [isOpen])
}

