export default function AppLogo({
  size = 24,
  className = '',
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="100 20 1336 1120"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Nonla Desk logo"
    >
      <title>Nonla Desk</title>
      <ellipse fill="#dd7627" cx="767" cy="640" rx="666" ry="52" />
      <path fill="none" stroke="#dd7627" strokeWidth="20" d="M112 640 A655 106 0 0 1 1422 640" />
      <path
        fill="#ffa333"
        d="M768 68 C752 68 640 145 439 300 C338 377 250 449 194 500 C172 519 150 540 134 560 C122 576 109 591 103 600 C99 613 100 628 101 640 A666 108 0 0 1 1433 640 C1434 628 1435 613 1431 600 C1425 591 1412 576 1400 560 C1384 540 1362 519 1340 500 C1284 449 1196 377 1095 300 C894 145 782 68 768 68Z"
      />
      <g fill="none" stroke="#dd7627" strokeWidth="6" strokeLinecap="round" opacity=".55">
        <path d="M750 96 C625 260 455 421 282 563" />
        <path d="M758 96 C700 241 644 377 588 507" />
        <path d="M778 96 C836 241 892 377 948 507" />
        <path d="M786 96 C911 260 1081 421 1254 563" />
      </g>
      <rect fill="#121212" x="463" y="720" width="191" height="407" rx="40" />
      <rect fill="#121212" x="717" y="987" width="433" height="134" rx="40" />
    </svg>
  )
}
