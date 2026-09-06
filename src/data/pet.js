/**
 * Copy and pacing for the scroll companion. Messages are deliberately short —
 * the pet is a nudge toward the next section, not a second navigation.
 */
export const pet = {
  name: 'Byte',
  dismissLabel: 'Dismiss Byte',
  greeting: "Hi, I'm Byte. Most visitors leave in 12 seconds — let's beat that.",

  /** Keyed to the section ids in <main>; fires as each one crosses the viewport. */
  stops: {
    home: "Hi, I'm Byte. Most visitors leave in 12 seconds — let's beat that.",
    projects: 'Two shipped products. The Shopify one is live on the App Store — real merchants, real carts.',
    experience: 'Here is where the numbers live. 15 seconds down to 300ms is the one I would read twice.',
    stack: 'Not everything he has ever touched — just what he can debug at 2am.',
    about: 'The human part. There is a timeline hiding in here too.',
    contact: 'You made it to the end. Genuinely rare — most people stop at Projects.',
  },

  /** One-shot nudges at scroll depth, so the middle of the page never feels flat. */
  milestones: [
    { at: 0.25, message: 'A quarter down. The good numbers are further in.' },
    { at: 0.55, message: 'Halfway. You are already ahead of most people who open this.' },
    { at: 0.8, message: 'Almost there. Keep going — the ending is worth it.' },
  ],

  /** Shown when the page sits still for a while. */
  idle: [
    'Still there? Take your time.',
    'There is more below. The numbers are worth it.',
    'I will wait. I am very good at waiting.',
  ],

  finale: {
    message: 'You read the whole thing. That deserves a hello.',
    ctaLabel: 'Say hi',
  },

  sleeping: 'Zzz…',
}
