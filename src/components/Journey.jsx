import { useState } from 'react'
import { content } from '../data/content'
import { journey } from '../data/journey'
import { ChevronDown, JourneyIcon } from './icons'

const COLLAPSED_COUNT = Math.ceil(journey.length / 2)

export default function Journey() {
  const [openIds, setOpenIds] = useState([])
  const [showAll, setShowAll] = useState(false)
  const copy = content.journey

  const hasMore = journey.length > COLLAPSED_COUNT
  const items = showAll ? journey : journey.slice(0, COLLAPSED_COUNT)

  const toggleItem = (id) => {
    setOpenIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))
  }

  return (
    <div className="about-journey reveal">
      <div className="about-journey__header">
        <h2>{copy.heading}</h2>
      </div>

      <div className="about-journey__tree">
        <span className="about-journey__badge about-journey__badge--start">{copy.start}</span>

        <ol className="about-journey__list" id="about-journey-list">
          {items.map((item, index) => {
            const side = index % 2 === 0 ? 'left' : 'right'
            const isOpen = openIds.includes(item.id)
            const panelId = `about-journey-${item.id}-panel`

            return (
              <li
                key={item.id}
                className={[
                  'about-journey__item',
                  `about-journey__item--${side}`,
                  isOpen ? 'about-journey__item--open' : '',
                  item.dateLabel ? 'about-journey__item--dated' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span aria-hidden="true" className="about-journey__branch" />
                {item.dateLabel ? <span className="about-journey__date">{item.dateLabel}</span> : null}
                <span aria-hidden="true" className="about-journey__node" />

                <button
                  aria-controls={panelId}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? copy.close : copy.open} ${index + 1}. ${item.title}`}
                  className="about-journey__card"
                  onClick={() => toggleItem(item.id)}
                  type="button"
                >
                  <span className="about-journey__index">{index + 1}</span>
                  <span className="about-journey__icon-shell">
                    <JourneyIcon kind={item.icon} />
                  </span>
                  <span aria-hidden={!isOpen} className="about-journey__content" id={panelId}>
                    <span className="about-journey__title">{item.title}</span>
                    <span className="about-journey__description">{item.description}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {!hasMore || showAll ? (
          <span className="about-journey__badge about-journey__badge--end">{copy.end}</span>
        ) : null}
      </div>

      {hasMore ? (
        <div className="about-journey__actions">
          <button
            aria-controls="about-journey-list"
            aria-expanded={showAll}
            className="about-journey__toggle"
            onClick={() => setShowAll((open) => !open)}
            type="button"
          >
            <span>{showAll ? copy.showLess : copy.showMore}</span>
            <ChevronDown className="about-journey__toggle-icon" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
