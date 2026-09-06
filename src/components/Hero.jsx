import { useEffect, useState } from 'react'
import { content, profile, socialLinks } from '../data/content'
import { projects } from '../data/projects'
import { ArrowDown, socialIcons } from './icons'

const stats = [
  { id: 'profile', label: content.hero.statLabels.profile, value: content.hero.status },
  { id: 'leetcode', label: content.hero.statLabels.leetcode, prefix: '', suffix: '+', value: 250 },
  { id: 'projects', label: content.hero.statLabels.projects, prefix: '', suffix: '', value: projects.length },
]

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function CountUp({ value }) {
  const [current, setCurrent] = useState(() => (prefersReducedMotion() ? value : 0))

  useEffect(() => {
    if (prefersReducedMotion()) {
      setCurrent(value)
      return undefined
    }
    const duration = 1400
    const start = performance.now()
    let frame = 0

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(value * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <>{current}</>
}

export default function Hero() {
  const hero = content.hero

  return (
    <section className="section hero" id="home">
      <div aria-hidden="true" className="hero__grid" />
      <div aria-hidden="true" className="ambient ambient--primary" />
      <div aria-hidden="true" className="ambient ambient--secondary" />

      <div className="hero__content">
        <div className="hero__intro">
          <p className="status-pill reveal">
            <span aria-hidden="true" className="status-pill__dot" />
            {hero.status}
          </p>
          <p className="hero__title reveal" style={{ '--index': 1 }}>
            {hero.title}
          </p>
          <h1 className="hero__heading reveal" style={{ '--index': 2 }}>
            {hero.heading} <span className="hero__highlight">{hero.highlight}</span>
          </h1>
          <p className="hero__subtitle reveal" style={{ '--index': 3 }}>
            {hero.subtitle}
          </p>

          <div className="hero__actions reveal" style={{ '--index': 4 }}>
            <a className="button button--primary" href="#projects">
              {hero.projectsCta}
            </a>
            <a className="button button--secondary" href="#contact">
              {hero.contactCta}
            </a>
          </div>

          <div className="hero__socials reveal" style={{ '--index': 5 }}>
            {socialLinks.map((link) => (
              <a
                key={link.href}
                aria-label={link.label}
                className="hero__social-link"
                href={link.href}
                rel={link.kind === 'social' ? 'noopener noreferrer' : undefined}
                target={link.kind === 'social' ? '_blank' : undefined}
              >
                {socialIcons[link.label]}
              </a>
            ))}
          </div>
        </div>

        <dl aria-label={hero.statsLabel} className="hero__stats">
          {stats.map((stat) => (
            <div key={stat.id} className="hero__stat">
              <dt>{stat.label}</dt>
              <dd>
                {typeof stat.value === 'number' ? (
                  <span className="hero__stat-value">
                    <CountUp value={stat.value} />
                    {stat.suffix}
                  </span>
                ) : (
                  <span className="hero__stat-text">{stat.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <a aria-label={content.projects.eyebrow} className="hero__scroll" href="#projects">
        <ArrowDown />
      </a>

      <span className="visually-hidden">
        {profile.name}, {profile.role}, {profile.location}
      </span>
    </section>
  )
}
