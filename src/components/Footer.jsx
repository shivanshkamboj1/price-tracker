import { content, socialLinks } from '../data/content'

export default function Footer() {
  const copy = content.footer
  const socials = socialLinks.filter((link) => link.kind === 'social')

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <p>{copy.brand}</p>
        </div>
        <nav aria-label={copy.socialLabel}>
          {socials.map((link) => (
            <a key={link.href} href={link.href} rel="noopener noreferrer" target="_blank">
              {link.label}
            </a>
          ))}
        </nav>
        <p>{copy.copyright}</p>
      </div>
    </footer>
  )
}
