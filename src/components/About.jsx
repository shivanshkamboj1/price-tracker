import { useEffect, useRef, useState } from 'react'
import { content, faqs, socialLinks } from '../data/content'
import { ChevronDown } from './icons'
import Journey from './Journey'

function Accordion() {
  const [openId, setOpenId] = useState(() => faqs[0]?.id ?? '')

  return (
    <div className="about-accordion reveal">
      {faqs.map((faq) => {
        const panelId = `about-accordion-${faq.id}-panel`
        const isOpen = openId === faq.id

        return (
          <div key={faq.id} className="about-accordion__item">
            <h3 className="about-accordion__heading">
              <button
                aria-controls={panelId}
                aria-expanded={isOpen}
                className="about-accordion__trigger"
                onClick={() => setOpenId((current) => (current === faq.id ? '' : faq.id))}
                type="button"
              >
                <span>{faq.question}</span>
                <ChevronDown className="about-accordion__chevron" />
              </button>
            </h3>
            <div className="about-accordion__panel" hidden={!isOpen} id={panelId}>
              <p>{faq.answer}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function About() {
  const sectionRef = useRef(null)
  const [titleAnimated, setTitleAnimated] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const about = content.about
  const socials = socialLinks.filter((link) => link.kind === 'social')

  useEffect(() => {
    const node = sectionRef.current
    if (!node || titleAnimated) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setTitleAnimated(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -18%', threshold: 0.12 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [titleAnimated])

  return (
    <section
      ref={sectionRef}
      className={`section about-section${titleAnimated ? ' about-section--title-animated' : ''}`}
      id="about"
    >
      <div className="about-layout">
        <div className="about-content reveal">
          <p className="eyebrow">{about.eyebrow}</p>
          <h2>{about.heading}</h2>
          <ul aria-label={about.eyebrow} className="about-badges">
            {about.badges.map((badge) => (
              <li key={badge}>{badge}</li>
            ))}
          </ul>
          <div className="about-copy">
            {about.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="social-row">
            {socials.map((link) => (
              <a key={link.href} href={link.href} rel="noopener noreferrer" target="_blank">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <Accordion />
      <Journey />
    </section>
  )
}
