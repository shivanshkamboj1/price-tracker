import { useEffect, useRef } from 'react'

/** Easing applied per frame — lower is heavier/laggier, higher snaps to the pointer. */
const GLASS_EASE = 0.16
const DOT_EASE = 0.42
/** Scale easing for the hover/press reactions. */
const SCALE_EASE = 0.14
/** Speed (px/frame) at which the blob reaches its maximum stretch. */
const STRETCH_SPEED = 70
const MAX_STRETCH = 0.34

const INTERACTIVE = 'a, button, summary, [role="button"], [role="link"], [data-cursor="hover"]'
const TEXT_FIELD = 'input, textarea, select, [contenteditable="true"]'

/**
 * A glass blob that trails the pointer, with a small dot that stands in for the
 * native cursor. Position is written straight to the DOM inside a rAF loop, so
 * no React state changes while the pointer moves.
 *
 * Disabled entirely for coarse pointers (touch) and reduced-motion users; the
 * native cursor is only hidden once the effect is actually running.
 */
export default function LiquidCursor() {
  const rootRef = useRef(null)
  const orbRef = useRef(null)
  const glassRef = useRef(null)
  const dotRef = useRef(null)

  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!finePointer.matches || reducedMotion.matches) return undefined

    const root = rootRef.current
    const orb = orbRef.current
    const glass = glassRef.current
    const dot = dotRef.current
    if (!root || !orb || !glass || !dot) return undefined

    document.documentElement.classList.add('has-liquid-cursor')

    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const glassAt = { ...pointer }
    const dotAt = { ...pointer }

    let targetScale = 1
    let scale = 1
    let targetPress = 1
    let press = 1
    let angle = 0
    let awake = false
    let frame = 0

    const wake = () => {
      if (awake) return
      awake = true
      // Start where the pointer already is so the blob never flies in from the centre.
      glassAt.x = pointer.x
      glassAt.y = pointer.y
      dotAt.x = pointer.x
      dotAt.y = pointer.y
      root.classList.add('liquid-cursor--visible')
    }

    const handleMove = (event) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      wake()
    }

    const handleOver = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(TEXT_FIELD)) {
        root.classList.add('liquid-cursor--text')
        root.classList.remove('liquid-cursor--hover')
        targetScale = 0.72
        return
      }
      root.classList.remove('liquid-cursor--text')
      const hovering = Boolean(target.closest(INTERACTIVE))
      root.classList.toggle('liquid-cursor--hover', hovering)
      targetScale = hovering ? 1.85 : 1
    }

    const handleLeave = () => {
      awake = false
      root.classList.remove('liquid-cursor--visible')
    }

    const handleDown = () => {
      targetPress = 0.78
    }

    const handleUp = () => {
      targetPress = 1
    }

    const tick = () => {
      frame = window.requestAnimationFrame(tick)

      const previousX = glassAt.x
      const previousY = glassAt.y

      glassAt.x += (pointer.x - glassAt.x) * GLASS_EASE
      glassAt.y += (pointer.y - glassAt.y) * GLASS_EASE
      dotAt.x += (pointer.x - dotAt.x) * DOT_EASE
      dotAt.y += (pointer.y - dotAt.y) * DOT_EASE

      const vx = glassAt.x - previousX
      const vy = glassAt.y - previousY
      const speed = Math.hypot(vx, vy)
      // Squash along the travel direction so fast moves read as liquid, not as a rigid disc.
      const stretch = Math.min(speed / STRETCH_SPEED, 1) * MAX_STRETCH
      if (speed > 0.4) angle = (Math.atan2(vy, vx) * 180) / Math.PI

      scale += (targetScale - scale) * SCALE_EASE
      press += (targetPress - press) * 0.22
      const size = scale * press

      orb.style.transform = `translate3d(${glassAt.x}px, ${glassAt.y}px, 0)`
      glass.style.transform = `rotate(${angle}deg) scale(${size * (1 + stretch)}, ${
        size * (1 - stretch * 0.72)
      })`
      dot.style.transform = `translate3d(${dotAt.x}px, ${dotAt.y}px, 0)`
    }

    frame = window.requestAnimationFrame(tick)
    window.addEventListener('pointermove', handleMove, { passive: true })
    window.addEventListener('pointerover', handleOver, { passive: true })
    window.addEventListener('pointerdown', handleDown, { passive: true })
    window.addEventListener('pointerup', handleUp, { passive: true })
    document.addEventListener('pointerleave', handleLeave)
    window.addEventListener('blur', handleLeave)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerover', handleOver)
      window.removeEventListener('pointerdown', handleDown)
      window.removeEventListener('pointerup', handleUp)
      document.removeEventListener('pointerleave', handleLeave)
      window.removeEventListener('blur', handleLeave)
      document.documentElement.classList.remove('has-liquid-cursor')
    }
  }, [])

  return (
    <div aria-hidden="true" className="liquid-cursor" ref={rootRef}>
      <div className="liquid-cursor__orb" ref={orbRef}>
        <div className="liquid-cursor__glass" ref={glassRef} />
      </div>
      <div className="liquid-cursor__dot" ref={dotRef} />
    </div>
  )
}
