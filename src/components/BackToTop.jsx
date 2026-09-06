import { useEffect, useState } from 'react'
import { content } from '../data/content'
import { ArrowUp } from './icons'

export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 420)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <button
      aria-label={content.topButtonLabel}
      className={`back-to-top${visible ? ' back-to-top--visible' : ''}`}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      type="button"
    >
      <ArrowUp />
    </button>
  )
}
