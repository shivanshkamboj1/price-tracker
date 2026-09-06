export const projects = [
  {
    title: 'CartBridge',
    status: 'Live on the Shopify App Store',
    description:
      'Cross-device shopping cart sync that keeps a customer basket alive between phone and desktop, cutting cart abandonment at checkout.',
    highlights: [
      'Merchant dashboard in React.js with Context API state management',
      'Analytics module with interactive graphs and email-based CSV export',
      'CI/CD via GitHub Actions, auto-deploying to AWS EC2 on every push',
      'Deployed behind Nginx on a custom domain',
    ],
    imageSrc: './projects/cartbridge.svg',
    imageAlt: 'Dark dashboard interface showing cart sync activity and analytics graphs.',
    stack: ['React JS', 'Node JS', 'Express JS', 'MongoDB', 'AWS'],
    repositoryHref: '',
    href: 'https://apps.shopify.com/super-cart-sync-analytics',
    date: 'Apr 2026',
  },
  {
    title: 'ScholarsBridge',
    status: 'Live',
    description:
      'Online education platform where teachers list course content and students buy, enrol and study it end to end.',
    highlights: [
      'Razorpay payment processing with Cloudinary for secure media storage',
      'Thunk-based async flows for OTP signup, login, password reset and profile updates',
      'Auth token, user and cart slices persisted to localStorage',
      'Registration and login front-end built in React.js',
    ],
    imageSrc: './projects/scholarsbridge.svg',
    imageAlt: 'Education platform interface with course cards, lesson list and checkout panel.',
    stack: ['React JS', 'Redux Toolkit', 'Node JS', 'MongoDB', 'Razorpay'],
    repositoryHref: '',
    href: 'https://scholarsbridge.vercel.app/',
    date: 'Oct 2024',
  },
]
