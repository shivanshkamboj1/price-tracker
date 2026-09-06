import { useCallback, useEffect, useState } from 'react'
import About from './components/About'
import BackToTop from './components/BackToTop'
import Contact from './components/Contact'
import Experience from './components/Experience'
import Footer from './components/Footer'
import Header from './components/Header'
import Hero from './components/Hero'
import Projects from './components/Projects'
import Stack from './components/Stack'
import { content } from './data/content'
import { useScrollFade } from './hooks/useScrollFade'

function readStoredTheme() {
  try {
    return window.localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export default function App() {
  const [theme, setTheme] = useState(readStoredTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') root.dataset.theme = 'light'
    else delete root.dataset.theme
    root.style.colorScheme = theme

    try {
      window.localStorage.setItem('theme', theme)
    } catch {
      // Ignore storage failures (private mode, blocked cookies).
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  useScrollFade()

  return (
    <>
      <a className="skip-link" href="#main">
        {content.skipLink}
      </a>
      <Header onToggleTheme={toggleTheme} theme={theme} />
      <main id="main">
        <Hero />
        <Projects />
        <Experience />
        <Stack />
        <About />
        <Contact />
      </main>
      <Footer />
      <BackToTop />
    </>
  )
}
