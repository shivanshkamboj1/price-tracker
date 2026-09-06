import { content } from '../data/content'
import { education, experience } from '../data/experience'

export default function Experience() {
  const copy = content.experience

  return (
    <section className="section experience-section" id="experience">
      <div className="section-heading section-heading--split reveal">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.heading}</h2>
        </div>
        <p>{copy.text}</p>
      </div>

      <div className="experience-list">
        {experience.map((role, index) => (
          <article key={role.id} className="experience-card reveal" style={{ '--index': index }}>
            <div className="experience-card__head">
              <div>
                <p className="experience-card__company">{role.company}</p>
                <h3 className="experience-card__role">{role.role}</h3>
              </div>
              <p className="experience-card__meta">
                {role.period}
                <br />
                {role.location}
              </p>
            </div>

            <ul>
              {role.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>

            <div className="chip-list experience-card__metrics">
              {role.metrics.map((metric) => (
                <span key={metric} className="chip project-card__chip">
                  {metric}
                </span>
              ))}
              {role.link ? (
                <a
                  className="chip project-card__chip experience-card__link"
                  href={role.link.href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {role.link.label}
                </a>
              ) : null}
            </div>
          </article>
        ))}

        <article className="experience-card reveal" style={{ '--index': experience.length }}>
          <div className="experience-card__head">
            <div>
              <p className="experience-card__company">Education</p>
              <h3 className="experience-card__role">{education.degree}</h3>
            </div>
            <p className="experience-card__meta">
              {education.period}
              <br />
              {education.school}
            </p>
          </div>
        </article>
      </div>
    </section>
  )
}
