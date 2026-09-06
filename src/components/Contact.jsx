import { content, profile, socialLinks } from '../data/content'

export default function Contact() {
  const copy = content.contact
  const email = socialLinks.find((link) => link.kind === 'email')

  return (
    <section className="section contact-section" id="contact">
      <div className="contact-panel reveal">
        <div aria-hidden="true" className="contact-panel__overlay" />
        <div className="contact-panel__content">
          <p className="eyebrow">Contact</p>
          <h2>{copy.heading}</h2>
          <p>{copy.text}</p>

          {email ? (
            <a className="button button--primary button--large" href={email.href}>
              {profile.email}
            </a>
          ) : null}

          <dl className="contact-panel__meta">
            {Object.entries(copy.meta).map(([key, [term, value]]) => (
              <div key={key}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
