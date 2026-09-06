import { content } from '../data/content'
import { stackGroups } from '../data/stack'
import SkillsTree from './SkillsTree'

const iconUrl = (slug, color) => `https://cdn.simpleicons.org/${slug}${color ? `/${color}` : ''}`

// The icon CDN drops slugs from time to time; hide anything that fails rather
// than leaving a broken-image glyph in the badge.
const hideBrokenIcon = (event) => {
  event.currentTarget.style.display = 'none'
}

export default function Stack() {
  const copy = content.stack

  return (
    <section className="section stack-section" id="stack">
      <div className="section-heading section-heading--split reveal">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.heading}</h2>
        </div>
        <p>{copy.text}</p>
      </div>

      <div className="stack-grid">
        {stackGroups.map((group, index) => (
          <article
            key={group.title}
            className={`stack-card stack-card--${group.tone} reveal`}
            style={{ '--index': index }}
          >
            <span className="stack-card__icon">
              <img
                alt=""
                aria-hidden="true"
                loading="lazy"
                onError={hideBrokenIcon}
                src={group.iconSrc ?? iconUrl(group.icon, group.iconColor)}
              />
            </span>
            <h3>{group.title}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.label} className="stack-badge">
                  <img
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    onError={hideBrokenIcon}
                    src={item.iconSrc ?? iconUrl(item.icon, item.iconColor)}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <SkillsTree />
    </section>
  )
}
