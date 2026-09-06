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

    const reveal = (section) => {
      section.classList.add('section--scroll-visible')
      observer.unobserve(section)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          reveal(entry.target)
        })
      },
      { rootMargin: '0px 0px -5%', threshold: 0.01 }
    )

    // An anchor jump lands on a section before the observer reports it, which
    // would show the target as blank space mid-fade. Reveal it up front.
    const revealHashTarget = () => {
      const id = window.location.hash.slice(1)
      if (!id) return
      const target = document.getElementById(id)
      if (target && sections.includes(target)) reveal(target)
    }

    sections.forEach((section) => observer.observe(section))
    revealHashTarget()
    window.addEventListener('hashchange', revealHashTarget)

    return () => {
      observer.disconnect()
      window.removeEventListener('hashchange', revealHashTarget)
    }
  }, [])
}
