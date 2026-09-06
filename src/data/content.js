export const profile = {
  name: 'Shivansh Kamboj',
  role: 'Full Stack Developer',
  location: 'Noida, India',
  email: 'kambojshivansh2004@gmail.com',
  phone: '+91 87086 06784',
  resume: './resume/Shivansh-Kamboj-Resume.pdf',
  monogram: 'SK',
}

export const socialLinks = [
  { label: 'GitHub', href: 'https://github.com/shivanshkamboj', kind: 'social' },
  { label: 'LinkedIn', href: 'https://linkedin.com/in/shivanshkamboj', kind: 'social' },
  { label: 'LeetCode', href: 'https://leetcode.com/u/shivanshkamboj/', kind: 'social' },
  { label: 'Email', href: `mailto:${profile.email}`, kind: 'email' },
]

export const content = {
  skipLink: 'Skip to content',
  topButtonLabel: 'Back to top',
  nav: {
    home: 'Home',
    projects: 'Projects',
    experience: 'Experience',
    stack: 'Stack',
    about: 'About',
    contact: 'Contact',
    mainLabel: 'Main navigation',
    externalLabel: 'External links',
    homeLabel: 'Shivansh Kamboj - home',
    openMenuLabel: 'Open menu',
    closeMenuLabel: 'Close menu',
    themeDarkLabel: 'Switch to dark theme',
    themeLightLabel: 'Switch to light theme',
    resumeLabel: 'Download resume (PDF)',
  },
  hero: {
    status: 'Full Stack Developer',
    title: 'Shivansh Kamboj | Full Stack Developer | Noida, India',
    heading: 'Turning product needs into scalable, secure and',
    highlight: 'maintainable systems',
    subtitle:
      'Full stack developer with 1+ year building scalable Node.js APIs, GraphQL services and secure payment systems. I care about the numbers behind a feature: response times, failure paths and the support tickets it never generates.',
    projectsCta: 'View projects',
    contactCta: 'Contact me',
    statsLabel: 'Hero stats',
    statLabels: {
      profile: 'Profile',
      leetcode: 'LeetCode solved',
      projects: 'Projects',
    },
  },
  projects: {
    eyebrow: 'Portfolio',
    heading: 'Build & Ship',
    text: 'Projects built end to end to solve a real problem, with a clear structure, measurable outcomes and code that stays readable after the demo.',
    showAllLabel: 'Show all projects',
    hideExtraLabel: 'Hide extra projects',
    ctaText: 'Have a project in mind?',
    ctaLink: 'Get in touch',
    viewProject: 'View project',
    github: 'GitHub',
    view: 'View',
  },
  experience: {
    eyebrow: 'Experience',
    heading: 'Where the work actually shipped',
    text: 'Production work on payments, security and performance — with the before/after numbers that made the case for each change.',
  },
  stack: {
    eyebrow: 'Stack & skills',
    heading: 'A pragmatic stack built for performance, security and iteration speed.',
    text: 'Tools I can reason about, deploy and keep maintaining once the first release is out.',
  },
  about: {
    eyebrow: 'About',
    heading: "Hello, I'm Shivansh.",
    badges: ['Noida, India', 'Full Stack Developer', 'Node.js · React · MongoDB'],
    intro: [
      'I am a full stack developer based in Noida, currently an Associate Software Engineer at Seventh Triangle Consulting, where I work on payment wallets, CRM performance and application security for production traffic.',
      'Most of my favourite work starts with a measurement rather than a rewrite: a 15-second CRM query traced back to a missing index, a signup flow that gave back 1.5 seconds, an OTP endpoint bleeding fraudulent traffic until WAF rules and rate limiting cut it by 96%.',
      'Outside of work I build full stack side projects, keep a steady LeetCode habit, and enjoy the part of the job where a messy requirement finally turns into something simple.',
    ],
  },
  journey: {
    heading: 'How I got here',
    start: 'Aug 2021',
    end: 'Today',
    open: 'Open',
    close: 'Close',
    showMore: 'More',
    showLess: 'Reduce',
  },
  contact: {
    heading: "Let's build something reliable.",
    text: 'Open to full stack and backend roles, freelance builds, and conversations about APIs, payments or performance work. The fastest way to reach me is email.',
    meta: {
      profile: ['Profile', 'Full Stack'],
      focus: ['Focus', 'Node.js / React'],
      location: ['Location', 'Noida, India'],
      phone: ['Phone', '+91 87086 06784'],
    },
  },
  footer: {
    brand: 'Shivansh Kamboj - Full Stack Developer',
    copyright: `© ${new Date().getFullYear()} Shivansh Kamboj. All rights reserved.`,
    socialLabel: 'Footer social links',
  },
}

export const faqs = [
  {
    id: 'working-style',
    question: 'How do you approach a problem you have never seen before?',
    answer:
      'Reproduce it, measure it, then fix the root cause. The CRM wallet search that took 15 seconds was not a rewrite problem — it was a missing index and a query that filtered too late. I try to find the cheapest change that moves the number before touching the architecture.',
  },
  {
    id: 'delivery-focus',
    question: 'What do you optimise for when shipping a feature?',
    answer:
      'Response time, the failure path and the support load afterwards. Designing rollback handling for the payment wallet and a dashboard for failed redemptions mattered more than the happy path, because that is where users and the support team actually get stuck.',
  },
  {
    id: 'security',
    question: 'How do you handle security work?',
    answer:
      'Treat findings as a backlog, not a fire. After a KPMG audit I worked through the reported vulnerabilities one attack vector at a time, added application-level controls, and layered WAF rules with phone and IP rate limiting so the abuse stopped at the edge as well as in the code.',
  },
  {
    id: 'collaboration',
    question: 'How do you work with a team?',
    answer:
      'Share context early, write down the decisions that were hard to reach, and keep pull requests small enough to review properly. Most of the time saved on a feature comes from the conversation before the code, not the code itself.',
  },
]
