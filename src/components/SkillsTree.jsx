import { useState } from 'react'
import { skillsTree } from '../data/stack'
import { SkillIcon } from './icons'

function TreeNode({ expandedIds, node, onToggle }) {
  const contentId = `skills-tree-${node.id}-content`
  const children = node.children ?? []
  const keywords = node.keywords ?? []
  const hasContent = children.length > 0 || keywords.length > 0
  const isOpen = expandedIds.has(node.id)

  return (
    <li className="skills-tree__node">
      <button
        aria-controls={contentId}
        aria-expanded={isOpen}
        className="skills-tree__trigger"
        onClick={() => onToggle(node.id)}
        type="button"
      >
        <span aria-hidden="true" className="skills-tree__chevron" />
        <SkillIcon icon={node.icon} />
        <span className="skills-tree__label">{node.label}</span>
      </button>

      {hasContent ? (
        <div className="skills-tree__content" hidden={!isOpen} id={contentId}>
          {children.length > 0 ? (
            <ul className="skills-tree__list skills-tree__list--children">
              {children.map((child) => (
                <TreeNode key={child.id} expandedIds={expandedIds} node={child} onToggle={onToggle} />
              ))}
            </ul>
          ) : null}
          {keywords.length > 0 ? (
            <p className="skills-tree__keywords">
              <span className="visually-hidden">{node.label}: </span>
              {keywords.join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

export default function SkillsTree() {
  const [expandedIds, setExpandedIds] = useState(() => new Set([skillsTree.id]))

  const toggle = (id) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="skills-tree reveal">
      <ul className="skills-tree__list skills-tree__list--root">
        <TreeNode expandedIds={expandedIds} node={skillsTree} onToggle={toggle} />
      </ul>
    </div>
  )
}
