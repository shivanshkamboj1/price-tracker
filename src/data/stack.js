export const stackGroups = [
  {
    title: 'Frontend',
    icon: 'react',
    tone: 'primary',
    items: [
      { label: 'React.js', icon: 'react' },
      { label: 'Redux Toolkit', icon: 'redux' },
      { label: 'Context API', icon: 'react' },
      { label: 'JavaScript', icon: 'javascript' },
      { label: 'Tailwind CSS', icon: 'tailwindcss' },
      { label: 'HTML / CSS', icon: 'html5' },
    ],
  },
  {
    title: 'Backend',
    icon: 'nodedotjs',
    tone: 'secondary',
    items: [
      { label: 'Node.js', icon: 'nodedotjs' },
      { label: 'Express.js', icon: 'express', iconColor: 'E8ECF5' },
      { label: 'GraphQL', icon: 'graphql' },
      { label: 'REST APIs', icon: 'openapiinitiative', iconColor: 'E8ECF5' },
      { label: 'JWT Auth', icon: 'jsonwebtokens', iconColor: 'E8ECF5' },
      { label: 'Jest', icon: 'jest' },
    ],
  },
  {
    title: 'Data & Storage',
    icon: 'mongodb',
    tone: 'tertiary',
    items: [
      { label: 'MongoDB', icon: 'mongodb' },
      { label: 'Mongoose', icon: 'mongoose' },
      { label: 'Indexing', icon: 'databricks' },
      { label: 'Cloudinary', icon: 'cloudinary' },
    ],
  },
  {
    title: 'Cloud & Tooling',
    icon: 'github',
    iconColor: 'E8ECF5',
    tone: 'neutral',
    items: [
      { label: 'AWS', iconSrc: './icons/cloud.svg' },
      { label: 'Nginx', icon: 'nginx' },
      { label: 'PM2', icon: 'pm2' },
      { label: 'GitHub Actions', icon: 'githubactions' },
      { label: 'Git', icon: 'git' },
      { label: 'Postman', icon: 'postman' },
      { label: 'VS Code', iconSrc: './icons/editor.svg' },
    ],
  },
]

export const skillsTree = {
  id: 'skills',
  label: 'Skills',
  children: [
    {
      id: 'engineering-practices',
      icon: 'engineering',
      label: 'Engineering Practices',
      children: [
        {
          id: 'developer-workflow',
          icon: 'terminal',
          label: 'Developer Workflow',
          keywords: ['Git', 'GitHub', 'Postman', 'CLI', 'Debugging'],
        },
        {
          id: 'code-quality',
          icon: 'code-quality',
          label: 'Code Quality',
          keywords: ['Clean code', 'Naming', 'Jest tests', 'Maintainability'],
        },
      ],
    },
    {
      id: 'backend-security',
      icon: 'backend',
      label: 'Backend & Security',
      children: [
        {
          id: 'api-design',
          icon: 'api',
          label: 'API Design',
          keywords: ['REST', 'GraphQL', 'Pagination', 'Rate limiting', 'Error contracts'],
        },
        {
          id: 'app-security',
          icon: 'security',
          label: 'Application Security',
          keywords: ['JWT', 'bcrypt', 'WAF rules', 'Audit remediation', 'Abuse prevention'],
        },
        {
          id: 'performance',
          icon: 'code-quality',
          label: 'Performance',
          keywords: ['MongoDB indexes', 'Query pre-filtering', 'Latency profiling', 'Caching'],
        },
      ],
    },
    {
      id: 'product-delivery',
      icon: 'product',
      label: 'Product & Delivery',
      children: [
        {
          id: 'product-mindset',
          icon: 'product-mindset',
          label: 'Product Mindset',
          keywords: ['MVP', 'User stories', 'Rollback paths', 'Prioritization'],
        },
        {
          id: 'delivery',
          icon: 'delivery',
          label: 'Delivery',
          keywords: ['CI/CD', 'GitHub Actions', 'AWS EC2', 'Nginx', 'PM2', 'Documentation'],
        },
      ],
    },
  ],
}
