'use client'

import React from 'react'
import { HaloColor, HALOS } from './tokens'

interface ProductCardProps {
  name: string
  tag?: string
  price: string
  badge?: string
  badgeVariant?: 'green' | 'white'
  halo?: HaloColor
  media?: React.ReactNode
  className?: string
  onClick?: () => void
}

export function ProductCard({
  name,
  tag,
  price,
  badge,
  badgeVariant = 'green',
  halo,
  media,
  className = '',
  onClick,
}: ProductCardProps) {
  return (
    <article
      onClick={onClick}
      className={[
        'flex flex-col bg-[#141414] border border-[#242424] rounded-[10px] overflow-hidden',
        'cursor-pointer',
        'transition-[border-color,transform] duration-[220ms] ease-[cubic-bezier(.25,1,.5,1)]',
        'hover:border-[#78E825] hover:-translate-y-0.5',
        className,
      ].join(' ')}
    >
      {/* Media */}
      <div
        className="aspect-[4/3] grid place-items-center p-6 relative bg-[#1C1C1C]"
        style={halo ? { background: HALOS[halo] } : undefined}
      >
        {badge && (
          <span
            className={[
              'absolute top-3 left-3 text-[11px] font-semibold uppercase tracking-[0.16em]',
              'px-[10px] py-[6px] rounded-[2px]',
              badgeVariant === 'white'
                ? 'bg-white text-black'
                : 'bg-[#78E825] text-[#0E1F00]',
            ].join(' ')}
          >
            {badge}
          </span>
        )}
        {media}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 px-5 pt-4 pb-5">
        {tag && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#78E825]">
            {tag}
          </span>
        )}
        <h3 className="font-semibold text-[18px] leading-[1.25] tracking-[-0.018em] text-white m-0">
          {name}
        </h3>
        <span className="mt-auto font-medium text-[17px] leading-none text-white">
          {price}
        </span>
      </div>
    </article>
  )
}
