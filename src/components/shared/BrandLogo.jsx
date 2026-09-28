import { useState } from 'react'

export default function BrandLogo({
  size = 44,
  showWordmark = true,
  wordmarkSize = 24,
  imageSrc = '/edumaxim-logo.svg'
}) {
  const [showFallbackMark, setShowFallbackMark] = useState(!imageSrc)

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.7rem' }}>
      <div
        style={{
          position: 'relative',
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '1px solid rgba(180, 255, 57, 0.35)',
          background: 'linear-gradient(145deg, rgba(180, 255, 57, 0.2), rgba(149, 91, 233, 0.22))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {imageSrc && !showFallbackMark && (
          <img
            src={imageSrc}
            alt="Edumaxim logo"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setShowFallbackMark(true)}
          />
        )}
        <span
          style={{
            display: showFallbackMark ? 'inline-block' : 'none',
            position: 'absolute',
            fontSize: `${Math.max(14, Math.round(size * 0.38))}px`,
            fontWeight: 800,
            color: '#b4ff39',
            letterSpacing: '0.02em'
          }}
        >
          EM
        </span>
      </div>
      {showWordmark && (
        <span
          style={{
            fontSize: `${wordmarkSize}px`,
            fontWeight: 800,
            letterSpacing: '0.03em',
            lineHeight: 1,
            background: 'linear-gradient(90deg, #b4ff39 0%, #c080ff 58%, #b4ff39 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            color: 'transparent'
          }}
        >
          EDUMAXIM
        </span>
      )}
    </div>
  )
}
