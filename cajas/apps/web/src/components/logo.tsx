export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className="flex-none">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--accent)" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="var(--accent-ink)" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="2.6" fill="var(--accent-ink)" />
      <path d="M16 8v3M16 21v3M8 16h3M21 16h3" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
