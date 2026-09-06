# Shivansh Kamboj — Portfolio

A React + Vite portfolio modelled on the layout and design system of
[allenkoch.dev](https://allenkoch.dev/), with all content driven by
`ShivanshResume.pdf`.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build locally
```

Node 18+ required.

## Structure

```
public/
  favicon.svg
  icons/                    local glyphs for AWS / VS Code
  projects/*.svg            generated project artwork
  resume/                   the PDF served by the "Resume" button
src/
  App.jsx                   section order + theme state
  styles.css                the whole design system (tokens, layout, motion)
  data/
    content.js              all copy, social links, FAQ answers
    projects.js             project cards
    experience.js           roles, bullet points, metric chips, education
    stack.js                stack cards + the interactive skills tree
    journey.js              the timeline entries
  components/               one file per section
  hooks/useScrollFade.js    section fade-in on scroll
```

## Editing content

Everything visible on the page lives in `src/data/`. No component needs
touching to change a project, add a role, or rewrite a paragraph.

- **Add a project** — push an object onto the array in `data/projects.js`. With
  two cards the grid is two-up; a third switches it to three columns, and past
  three a chevron toggle appears automatically (`VISIBLE_PROJECTS` in
  `components/Projects.jsx`).
- **Add a job** — push onto `experience` in `data/experience.js`. `metrics`
  become the coloured chips under the bullet list.
- **Timeline** — `data/journey.js`. Entries alternate left/right; adding
  `dateLabel` puts a date pill on the spine. Half the list shows until the
  reader hits "More".
- **Skills tree / stack cards** — `data/stack.js`. Stack icons resolve from
  `cdn.simpleicons.org` by slug; anything the CDN has dropped uses a local
  `iconSrc` instead, and a failed icon hides itself rather than showing a
  broken image.

## Things to fill in before publishing

- `data/projects.js` — `repositoryHref` is empty on both projects, so only the
  "View" button shows. Add the real repo URLs and a "GitHub" button appears
  next to it.
- `index.html` — `canonical` and `og:url` use a placeholder domain. There is no
  `og:image`, so link previews render as a text card.
- Screenshots: the two files in `public/projects/` are generated artwork. Drop
  in real screenshots (1280×800, same filenames) when you have them.

## Deploying

`npm run build` produces a fully static `dist/`. `base` is `./` in
`vite.config.js`, so the output works from a subpath as well as a domain root —
drag `dist/` onto Netlify, or push and point Vercel/GitHub Pages at it.
