'use client'

import React from 'react'
import { HaloColor, HALOS } from './tokens'
import { Button } from './Button'

interface CtaConfig {
  label: string
  href?: string
  onClick?: () => void
}

interface HeroProps {
  eyebrow?: string
  brand?: string
  title: React.ReactNode
  body?: string
  halo?: HaloColor
  background?: string
  media?: React.ReactNode
  primaryCta?: CtaConfig
  secondaryCta?: CtaConfig
  minHeight?: number | string
  className?: string
}

export function Hero({
  eyebrow,
  brand,
  title,
  body,
  halo,
  background,
  media,
  primaryCta,
  secondaryCta,
  minHeight = 420,
  className = '',
}: HeroProps) {
  const bg = background ?? (halo ? HALOS[halo] : '#141414')

  return (
    <div
      className={[
        'relative overflow-hidden rounded-[16px] text-white',
        'grid grid-cols-2 gap-12 items-center',
        'px-12 py-16',
        className,
      ].join(' ')}
      style={{ background: bg, minHeight }}
    >
      {/* Copy */}
      <div className="flex flex-col gap-5 max-w-[48ch]">
        {brand && (
          <span className="font-bold text-[24px] leading-none tracking-[-0.03em] lowercase">
            {brand}
          </span>
        )}
        {eyebrow && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A8A8A]">
            {eyebrow}
          </span>
        )}
        <h1
          className="m-0 font-light leading-[1.02] tracking-[-0.018em] text-white"
          style={{ fontSize: 'clamp(40px, 4.4vw, 72px)' }}
        >
          {title}
        </h1>
        {body && (
          <p className="m-0 text-[18px] leading-[1.5] text-[#B8B8B8] max-w-[46ch]">
            {body}
          </p>
        )}
        {(primaryCta || secondaryCta) && (
          <div className="flex gap-3 mt-3">
            {primaryCta && (
              <Button variant="primary" size="lg" onClick={primaryCta.onClick}>
                {primaryCta.label}
              </Button>
            )}
            {secondaryCta && (
              <Button variant="ghost" size="lg" onClick={secondaryCta.onClick}>
                {secondaryCta.label}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Media */}
      {media && (
        <div className="relative h-full min-h-[320px] flex items-center justify-center">
          {media}
        </div>
      )}
    </div>
  )
}
