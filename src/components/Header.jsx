import { useEffect, useState } from 'react'
import { content, profile } from '../data/content'
import { DownloadIcon, MoonIcon, SunIcon } from './icons'

const links = [
  { href: '#home', key: 'home' },
  { href: '#projects', key: 'projects' },
  { href: '#experience', key: 'experience' },
  { href: '#stack', key: 'stack' },
  { href: '#about', key: 'about' },
  { href: '#contact', key: 'contact' },
]

export default function Header({ theme, onToggleTheme }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const nav = content.nav

  useEffect(() => {
    if (!menuOpen) return undefined
    const close = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menuOpen])

  return (
    <header className="site-header">
      <div className={`navbar${menuOpen ? ' navbar--menu-open' : ''}`}>
        <a aria-label={nav.homeLabel} className="brand" href="#home" onClick={() => setMenuOpen(false)}>
          <span aria-hidden="true" className="brand__mark">
            {profile.monogram}
          </span>
          <span>{profile.name}</span>
        </a>

        <button
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? nav.closeMenuLabel : nav.openMenuLabel}
          className="menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>

        <div className="navbar__menu" id="mobile-navigation">
          <nav aria-label={nav.mainLabel} className="navbar__links">
            {links.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
                {nav[link.key]}
              </a>
            ))}
          </nav>

          <div className="navbar__controls">
            <div className="navbar__toggles">
              <button
                aria-label={theme === 'dark' ? nav.themeLightLabel : nav.themeDarkLabel}
                className="icon-toggle"
                onClick={onToggleTheme}
                type="button"
              >
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              </button>
              <a aria-label={nav.resumeLabel} className="resume-link" download href={profile.resume}>
                <DownloadIcon />
                <span>Resume</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
