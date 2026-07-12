/** Crédito discreto LeadCapture — rodapé de superfícies públicas da loja. */
export function LeadCaptureByline({ className = '' }: { className?: string }) {
  return (
    <p
      className={`store-lc-byline text-center select-none ${className}`.trim()}
      aria-label="Powered by LeadCapture"
    >
      <span className="store-lc-byline__by">By</span>{' '}
      <span className="store-lc-byline__brand">LeadCapture</span>
    </p>
  )
}
