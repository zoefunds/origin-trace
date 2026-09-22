export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" aria-label="ORIGIN TRACE">
      <defs>
        <linearGradient id="traceGrad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00F0FF" />
          <stop offset="100%" stopColor="#0077FE" />
        </linearGradient>
        <linearGradient id="ringGrad" x1="120" y1="0" x2="0" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#1B263B" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="28" fill="#090D14" />
      <rect x="1" y="1" width="118" height="118" rx="27" stroke="#23334E" strokeWidth="2" />
      <circle cx="60" cy="60" r="42" stroke="url(#ringGrad)" strokeWidth="2.5" strokeDasharray="6 4" />
      <circle cx="60" cy="60" r="16" fill="url(#traceGrad)" />
      <circle cx="60" cy="60" r="8" fill="#090D14" />
      <circle cx="60" cy="60" r="3.5" fill="#00F0FF" />
      <path d="M22 60 H44 M76 60 H98" stroke="#00F0FF" strokeWidth="3" strokeLinecap="round" />
      <circle cx="22" cy="60" r="4" fill="#00F0FF" />
      <circle cx="98" cy="60" r="4" fill="#0077FE" />
      <path d="M46 36 L54 44 M66 76 L74 84" stroke="#00D2B4" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
