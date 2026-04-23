'use client'

import React from 'react'
import { HaloColor, HALOS } from './tokens'

export interface MegaLink {
  label: string
  href?: string
  highlight?: boolean
}

export interface MegaColumn {
  title: string
  links: MegaLink[]
}

interface MegaMenuProps {
  columns: MegaColumn[]
  isOpen: boolean
  featuredHalo?: HaloColor
  featuredEyebrow?: string
  featuredTitle?: string
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export function MegaMenu({
  columns,
  isOpen,
  featuredHalo,
  featuredEyebrow,
  featuredTitle,
  onMouseEnter,
  onMouseLeave,
}: MegaMenuProps) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={[
        'absolute left-0 right-0 top-full z-50',
        'bg-black border-b border-[#242424]',
        'px-8 pt-8 pb-12',
        'grid gap-x-12 gap-y-8',
        'shadow-[0_24px_48px_-16px_rgba(0,0,0,.8),inset_0_0_0_1px_#242424]',
        'transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(.22,.61,.36,1)]',
        isOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none',
      ].join(' ')}
      style={{ gridTemplateColumns: `repeat(${Math.min(columns.length + (featuredHalo ? 1 : 0), 4)}, 1fr)` }}
    >
      {columns.map((col) => (
        <div key={col.title}>
          <h4 className="m-0 mb-[14px] text-[14px] font-medium text-[#B8B8B8]">
            {col.title}
          </h4>
          {col.links.map((link) => (
            <a
              key={link.label}
              href={link.href ?? '#'}
              className={[
                'block py-1.5 text-[14px] font-medium leading-[1.4] no-underline',
                'transition-colors duration-[120ms]',
                link.highlight ? 'text-[#78E825]' : 'text-white hover:text-[#78E825]',
              ].join(' ')}
            >
              {link.label}
            </a>
          ))}
        </div>
      ))}

      {/* Featured halo card */}
      {featuredHalo && (
        <div
          className="rounded-[10px] min-h-[160px] flex items-end p-4"
          style={{ background: HALOS[featuredHalo] }}
        >
          <div>
            {featuredEyebrow && (
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white mb-1">
                {featuredEyebrow}
              </div>
            )}
            {featuredTitle && (
              <div className="text-[20px] font-semibold text-white leading-snug">
                {featuredTitle}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
