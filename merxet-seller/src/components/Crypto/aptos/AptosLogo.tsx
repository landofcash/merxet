import clsx from 'clsx'

type AptosLogoProps = {
  className?: string
  title?: string
}

export default function AptosLogo({ className, title = 'Aptos' }: AptosLogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={clsx('h-5 w-5 mt-0.5 text-blue-600 flex-shrink-0', className)}
    >
      <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="4" fill="none" />
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <line x1="16" y1="18" x2="48" y2="18" />
        <line x1="16" y1="26" x2="48" y2="26" />
        <line x1="16" y1="34" x2="48" y2="34" />
        <line x1="16" y1="42" x2="48" y2="42" />
        <line x1="16" y1="50" x2="48" y2="50" />
      </g>
    </svg>
  )
}
