export function SkillsIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13 3H21V11H13V3ZM15 5H19V9H15V5Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17 21V13H11V7H3V21H17ZM9 9H5V13H9V9ZM5 19L5 15H9V19H5ZM11 19V15H15V19H11Z"
      />
    </svg>
  );
}
