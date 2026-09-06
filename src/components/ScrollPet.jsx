import { useCallback, useEffect, useRef, useState } from 'react'
import { pet } from '../data/pet'
import { profile } from '../data/content'

const STORAGE_KEY = 'pet-dismissed'
const BUBBLE_MS = 6200
const IDLE_MS = 26000
const RING_RADIUS = 30
const RING_LENGTH = 2 * Math.PI * RING_RADIUS
const PUPIL_RANGE = 3.2

function readDismissed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * A small glass companion that tracks reading progress and nudges the visitor
 * toward the end of the page. Scroll progress and eye tracking are written
 * straight to the DOM; React state only changes when the message or mood does.
 */
export default function ScrollPet() {
  const [dismissed, setDismissed] = useState(readDismissed)
  const [message, setMessage] = useState('')
  const [mood, setMood] = useState('idle')
  const [finale, setFinale] = useState(false)

  const rootRef = useRef(null)
  const moodRef = useRef('idle')
  const ringRef = useRef(null)
  const leftPupilRef = useRef(null)
  const rightPupilRef = useRef(null)
  const bubbleTimer = useRef(0)
  const idleTimer = useRef(0)
  const seenMilestones = useRef(new Set())
  const idleIndex = useRef(0)

  /** Mood is mirrored into a ref so the scroll effect never re-subscribes on a mood change. */
  const changeMood = useCallback((next) => {
    moodRef.current = next
    setMood(next)
  }, [])

  const say = useCallback((text, { sticky = false } = {}) => {
    setMessage(text)
    window.clearTimeout(bubbleTimer.current)
    if (sticky) return
    bubbleTimer.current = window.setTimeout(() => setMessage(''), BUBBLE_MS)
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Ignore storage failures (private mode, blocked cookies).
    }
  }, [])

  // Greeting, scroll progress, milestones and the idle timer.
  useEffect(() => {
    if (dismissed) return undefined

    const greet = window.setTimeout(() => say(pet.greeting), 1400)
    let finished = false
    let queued = false

    const goIdle = () => {
      changeMood('sleepy')
      say(pet.idle[idleIndex.current % pet.idle.length])
      idleIndex.current += 1
    }

    const resetIdle = () => {
      window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(goIdle, IDLE_MS)
    }

    const readProgress = () => {
      queued = false
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const progress = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0

      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = String(RING_LENGTH * (1 - progress))
      }

      if (progress > 0.985 && !finished) {
        finished = true
        setFinale(true)
        changeMood('happy')
        say(pet.finale.message, { sticky: true })
        return
      }

      if (finished) return

      const milestone = pet.milestones.find(
        (item) => progress >= item.at && !seenMilestones.current.has(item.at)
      )
      if (milestone) {
        seenMilestones.current.add(milestone.at)
        say(milestone.message)
      }
    }

    const handleScroll = () => {
      if (moodRef.current === 'sleepy') changeMood('idle')
      resetIdle()
      if (queued) return
      queued = true
      window.requestAnimationFrame(readProgress)
    }

    readProgress()
    resetIdle()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.clearTimeout(greet)
      window.clearTimeout(idleTimer.current)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [changeMood, dismissed, say])

  // One message per section, fired as it crosses the middle of the viewport.
  useEffect(() => {
    if (dismissed) return undefined

    const sections = Object.keys(pet.stops)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
    if (sections.length === 0) return undefined

    let current = ''
    const observer = new IntersectionObserver(
      (entries) => {
        const active = entries.find((entry) => entry.isIntersecting)
        if (!active || active.target.id === current) return
        current = active.target.id
        // The greeting already covers the hero on first paint.
        if (current === 'home' && !seenMilestones.current.has('greeted')) {
          seenMilestones.current.add('greeted')
          return
        }
        changeMood(current === 'contact' ? 'happy' : 'idle')
        say(pet.stops[current])
      },
      { rootMargin: '-45% 0px -45% 0px' }
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [changeMood, dismissed, say])

  // Eyes follow the pointer, and a blink on a loose timer keeps it alive.
  useEffect(() => {
    if (dismissed) return undefined
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined

    const root = rootRef.current
    if (!root) return undefined

    let queued = false
    let pointerX = 0
    let pointerY = 0

    const render = () => {
      queued = false
      const box = root.getBoundingClientRect()
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      const angle = Math.atan2(pointerY - cy, pointerX - cx)
      const reach = Math.min(Math.hypot(pointerX - cx, pointerY - cy) / 260, 1) * PUPIL_RANGE
      const shift = `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach}px)`
      if (leftPupilRef.current) leftPupilRef.current.style.transform = shift
      if (rightPupilRef.current) rightPupilRef.current.style.transform = shift
    }

    const handleMove = (event) => {
      pointerX = event.clientX
      pointerY = event.clientY
      if (queued) return
      queued = true
      window.requestAnimationFrame(render)
    }

    let blinkTimer = 0
    const blink = () => {
      root.classList.add('pet--blink')
      window.setTimeout(() => root.classList.remove('pet--blink'), 170)
      blinkTimer = window.setTimeout(blink, 2600 + Math.random() * 4200)
    }
    blinkTimer = window.setTimeout(blink, 2400)

    window.addEventListener('pointermove', handleMove, { passive: true })
    return () => {
      window.clearTimeout(blinkTimer)
      window.removeEventListener('pointermove', handleMove)
    }
  }, [dismissed])

  useEffect(() => () => window.clearTimeout(bubbleTimer.current), [])

  if (dismissed) return null

  return (
    <div className={`pet pet--${mood}${finale ? ' pet--finale' : ''}`} ref={rootRef}>
      <div className={`pet__bubble${message ? ' pet__bubble--visible' : ''}`}>
        <p className="pet__message">{message}</p>
        {finale ? (
          <a className="pet__cta" href={`mailto:${profile.email}`}>
            {pet.finale.ctaLabel}
          </a>
        ) : null}
      </div>

      <div className="pet__body" data-name={pet.name}>
        <svg aria-hidden="true" className="pet__ring" viewBox="0 0 68 68">
          <circle className="pet__ring-track" cx="34" cy="34" r={RING_RADIUS} />
          <circle
            className="pet__ring-progress"
            cx="34"
            cy="34"
            r={RING_RADIUS}
            ref={ringRef}
            style={{ strokeDasharray: RING_LENGTH, strokeDashoffset: RING_LENGTH }}
          />
        </svg>

        <div aria-hidden="true" className="pet__blob">
          <span className="pet__eye">
            <span className="pet__pupil" ref={leftPupilRef} />
          </span>
          <span className="pet__eye">
            <span className="pet__pupil" ref={rightPupilRef} />
          </span>
          <span className="pet__cheek pet__cheek--left" />
          <span className="pet__cheek pet__cheek--right" />
          <span className="pet__sparkles" />
        </div>

        <button className="pet__dismiss" onClick={dismiss} title={pet.dismissLabel} type="button">
          <span aria-hidden="true">×</span>
          <span className="visually-hidden">{pet.dismissLabel}</span>
        </button>
      </div>
    </div>
  )
}
