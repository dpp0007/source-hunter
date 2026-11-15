export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="5.3" fill="#2f5bff" />
      <line x1="14.9" y1="14.9" x2="19.2" y2="19.2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="10.3" cy="10.3" r="5.6" fill="#ffe066" stroke="#fff" strokeWidth="1.7" />
      <line x1="7.8" y1="10.3" x2="12.8" y2="10.3" stroke="#2f5bff" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
