/** 진주랭킹 트로피 (가운데 J) */
export default function TrophyJ({ size = 64, badge = false, className = '' }: { size?: number; badge?: boolean; className?: string }) {
  const cup = badge ? '#fff' : '#245844';
  const letter = badge ? '#245844' : '#fff';
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {badge && <rect width="64" height="64" rx="15" fill="#245844" />}
      <path
        d="M19.5 20H13v3.5c0 6.2 4.3 10.4 10 10.9M44.5 20H51v3.5c0 6.2-4.3 10.4-10 10.9"
        fill="none"
        stroke={cup}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M18 13h28v11.5C46 33 39.8 39.5 32 39.5S18 33 18 24.5z" fill={cup} />
      <path d="M29 38h6v6.5h-6z" fill={cup} />
      <rect x="20.5" y="44" width="23" height="6.5" rx="2.2" fill={cup} />
      <path d="M27 18.5h9.5M34 18.5v9c0 2.8-1.6 4.3-3.9 4.3-1.9 0-3.3-1-3.8-2.9" fill="none" stroke={letter} strokeWidth="3.6" />
    </svg>
  );
}
