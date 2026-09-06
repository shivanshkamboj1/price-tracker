export const experience = [
  {
    id: 'seventh-triangle',
    company: 'Seventh Triangle Consulting Pvt Ltd',
    role: 'Associate Software Engineer',
    period: 'Aug 2025 - Present',
    location: 'Noida',
    bullets: [
      'Optimized the signup process, reducing response time by 1.5 seconds through query optimization.',
      "Reduced a CRM wallet search query's latency from 15s to 300ms using MongoDB indexes and query pre-filtering.",
      'Addressed multiple security vulnerabilities identified during a KPMG audit by implementing security controls to mitigate various attack vectors and strengthen application security.',
      'Designed rollback handling for the payment wallet and shipped a dashboard for failed redemptions and refunds, improving user experience and cutting customer support queries.',
      'Cut fraudulent OTP traffic by 96% by implementing WAF rules and phone and IP based rate limiting at the application level.',
    ],
    metrics: ['15s → 300ms', '-1.5s signup', '-96% OTP fraud', 'KPMG audit fixes'],
  },
  {
    id: 'hoping-minds',
    company: 'Hoping Minds',
    role: 'Internship',
    period: 'Jul 2024 - Aug 2024',
    location: 'Mohali',
    bullets: [
      'Integrated JWT authentication to ensure secure user data access and utilized bcrypt for safe and encrypted storage of user passwords in the database.',
    ],
    metrics: ['JWT auth', 'bcrypt hashing'],
    link: {
      label: 'Certificate',
      href: 'https://drive.google.com/file/d/1XxJeUvm4iavjwGYqX9pmprsseZxG1j3I/view?usp=sharing',
    },
  },
]

export const education = {
  school: 'JMIT, Radaur, Yamunanagar',
  degree: 'Bachelor of Technology in Information Technology',
  period: 'Aug 2021 - Jun 2025',
}
