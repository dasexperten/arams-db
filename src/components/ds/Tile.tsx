'use client'

import React, { useState } from 'react'
import { HaloColor, HALOS } from './tokens'

export type TileVariant = 'default' | 'flat' | 'split'

interface TileProps {
  label: string
  sublabel?: string
  halo?: HaloColor
  variant?: TileVariant
  media?: React.ReactNode
  className?: string
  onClick?: () => void
}

export function Tile({
  label,
  sublabel,
  halo = 'cyan',
  variant = 'default',
  media,
  className = '',
  onClick,
}: TileProps) {
  const [lit, setLit] = useState(false)
  const isFlat = variant === 'flat'
  const isSplit = variant === 'split'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      onMouseEnter={() => setLit(true)}
      onMouseLeave={() => setLit(false)}
      className={[
        'relative flex flex-col overflow-hidden rounded-[16px] bg-[#141414]',
        'aspect-square cursor-pointer',
        'transition-transform duration-[220ms] ease-[cubic-bezier(.25,1,.5,1)]',
        className,
      ].join(' ')}
    >
      {/* Halo overlay — fades in on hover */}
      {!isFlat && (
        <div
          className="absolute inset-0 transition-opacity duration-[420ms] ease-[cubic-bezier(.22,.61,.36,1)] pointer-events-none"
          style={{ background: HALOS[halo], opacity: lit ? 1 : 0 }}
        />
      )}

      {/* Media slot */}
      <div className="relative z-10 flex-1 grid place-items-center p-8 min-h-0">
        {media}
      </div>

      {/* Label */}
      <div
        className={[
          'relative z-10 px-5 pb-5 pt-4',
          'font-medium text-[17px] text-white leading-tight tracking-[-0.018em]',
          isSplit ? 'border-t border-[#242424] bg-black/40 backdrop-blur-sm' : '',
        ].join(' ')}
      >
        {label}
        {sublabel && (
          <div className="mt-1 text-[12px] font-normal text-[#B8B8B8] tracking-[0.08em] uppercase">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  )
}

export type { HaloColor }
