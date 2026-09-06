import { useEffect } from 'react'

/**
 * Fades each <section> in once it enters the viewport. Sections are marked with
 * the fade class from JS so that a no-JS render stays fully visible.
 */
export function useScrollFade() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    const sections = Array.from(document.querySelectorAll('main > section:not(.hero)'))
    if (sections.length === 0) return undefined

    sections.forEach((section) => section.classList.add('section--scroll-fade'))

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('section--scroll-visible')
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -12%', threshold: 0.08 }
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])
}
