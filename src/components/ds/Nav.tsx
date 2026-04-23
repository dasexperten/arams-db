'use client'

import React, { useRef, useState } from 'react'
import { MegaMenu, MegaColumn } from './MegaMenu'
import { HaloColor } from './tokens'

export interface NavItem {
  label: string
  href?: string
  active?: boolean
  megaKey?: string
}

export interface NavMegaConfig {
  columns: MegaColumn[]
  featuredHalo?: HaloColor
  featuredEyebrow?: string
  featuredTitle?: string
}

interface NavProps {
  brand?: string
  items?: NavItem[]
  mega?: Record<string, NavMegaConfig>
  topbarLeft?: React.ReactNode
  topbarRight?: React.ReactNode
  searchPlaceholder?: string
  cartSlot?: React.ReactNode
  className?: string
}

export function Nav({
  brand = 'brand',
  items = [],
  mega = {},
  topbarLeft,
  topbarRight,
  searchPlaceholder = 'Search products and parts',
  cartSlot,
  className = '',
}: NavProps) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const open = (key: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenKey(key)
  }
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpenKey(null), 160)
  }
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  const activeMega = openKey ? mega[openKey] : null

  return (
    <header className={`relative ${className}`}>
      {/* Topbar */}
      {(topbarLeft || topbarRight) && (
        <div className="flex items-center justify-between bg-black text-white px-8 min-h-[40px] text-[12px] font-medium">
          <div>{topbarLeft}</div>
          <div className="flex items-center gap-6 opacity-80">{topbarRight}</div>
        </div>
      )}

      {/* Primary nav */}
      <nav
        className="relative flex items-center gap-10 bg-black text-white border-b border-[#242424] px-8 py-[18px]"
        onMouseLeave={scheduleClose}
      >
        {/* Wordmark */}
        <span className="font-bold text-[24px] leading-none tracking-[-0.03em] lowercase shrink-0">
          {brand}
        </span>

        {/* Nav items */}
        <div className="flex items-center gap-9">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href ?? '#'}
              onMouseEnter={() => item.megaKey ? open(item.megaKey) : setOpenKey(null)}
              aria-current={item.active ? 'true' : undefined}
              className={[
                'text-[14px] font-medium py-2 cursor-pointer no-underline',
                'transition-colors duration-[120ms] ease-[cubic-bezier(.22,.61,.36,1)]',
                item.active || openKey === item.megaKey
                  ? 'text-[#78E825]'
                  : 'text-white hover:text-[#78E825]',
              ].join(' ')}
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <label className="flex items-center gap-2.5 bg-white text-black rounded-full px-[18px] py-[10px] text-[14px] min-w-[280px] border border-transparent cursor-text focus-within:border-[#78E825] focus-within:shadow-[0_0_0_3px_rgba(120,232,37,.24)] transition-shadow duration-[120ms]">
          <span className="opacity-40 text-lg leading-none">⌕</span>
          <input
            className="flex-1 bg-transparent outline-none min-w-0 text-black placeholder-[#6E6E6E]"
            placeholder={searchPlaceholder}
          />
        </label>

        {/* Cart slot */}
        {cartSlot && (
          <div className="ml-3">
            {cartSlot}
          </div>
        )}

        {/* Mega menu */}
        {Object.keys(mega).length > 0 && (
          <MegaMenu
            columns={activeMega?.columns ?? []}
            isOpen={!!activeMega}
            featuredHalo={activeMega?.featuredHalo}
            featuredEyebrow={activeMega?.featuredEyebrow}
            featuredTitle={activeMega?.featuredTitle}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          />
        )}
      </nav>
    </header>
  )
}
