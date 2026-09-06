import { useState } from 'react'
import { content } from '../data/content'
import { projects } from '../data/projects'
import { ChevronDown } from './icons'

const VISIBLE_PROJECTS = 3

function ProjectCard({ index, project }) {
  const copy = content.projects
  const hasLive = Boolean(project.href)
  const hasRepo = Boolean(project.repositoryHref)

  const media = (
    <img
      alt={project.imageAlt}
      decoding="async"
      height="720"
      loading="lazy"
      src={project.imageSrc}
      width="1280"
    />
  )

  return (
    <article className="project-card reveal" style={{ '--index': index }}>
      {hasLive ? (
        <a
          aria-label={`${copy.viewProject} ${project.title}`}
          className="project-card__media"
          href={project.href}
          rel="noopener noreferrer"
          target="_blank"
        >
          {media}
        </a>
      ) : (
        <div aria-hidden="true" className="project-card__media">
          {media}
        </div>
      )}

      <div className="project-card__body">
        <div className="project-card__header">
          <p>
            {project.status} · {project.date}
          </p>
          <h3>{project.title}</h3>
        </div>

        <p className="project-card__description">{project.description}</p>

        <ul className="project-card__highlights">
          {project.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>

        <div className="chip-list">
          {project.stack.map((item) => (
            <span key={item} className="chip project-card__chip">
              {item}
            </span>
          ))}
        </div>

        {hasRepo || hasLive ? (
          <div className="project-card__links">
            {hasRepo ? (
              <a
                className="project-card__link project-card__link--secondary"
                href={project.repositoryHref}
                rel="noopener noreferrer"
                target="_blank"
              >
                {copy.github}
              </a>
            ) : null}
            {hasLive ? (
              <a
                className="project-card__link project-card__link--primary"
                href={project.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {copy.view}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}

export default function Projects() {
  const [expanded, setExpanded] = useState(false)
  const copy = content.projects
  const hasMore = projects.length > VISIBLE_PROJECTS
  const visible = expanded ? projects : projects.slice(0, VISIBLE_PROJECTS)

  return (
    <section className="section projects-section" id="projects">
      <div className="section-heading section-heading--split reveal">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.heading}</h2>
        </div>
        <p>{copy.text}</p>
      </div>

      <div
        className={`projects-grid${visible.length < 3 ? ' projects-grid--wide' : ''}`}
        id="projects-grid"
      >
        {visible.map((project, index) => (
          <ProjectCard key={project.title} index={index} project={project} />
        ))}
      </div>

      {hasMore ? (
        <div className="projects-section__more reveal">
          <button
            aria-controls="projects-grid"
            aria-expanded={expanded}
            aria-label={expanded ? copy.hideExtraLabel : copy.showAllLabel}
            className="projects-toggle"
            onClick={() => setExpanded((open) => !open)}
            type="button"
          >
            <ChevronDown className="projects-toggle__icon" />
          </button>
        </div>
      ) : null}

      <div className="projects-section__cta reveal">
        <p>{copy.ctaText}</p>
        <a className="button button--primary" href="#contact">
          {copy.ctaLink}
        </a>
      </div>
    </section>
  )
}
