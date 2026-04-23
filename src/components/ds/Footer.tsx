import React from 'react'

export interface FooterLink {
  label: string
  href?: string
}

export interface FooterColumn {
  heading: string
  links: FooterLink[]
}

interface FooterProps {
  brand?: string
  tagline?: string
  columns?: FooterColumn[]
  socialSlot?: React.ReactNode
  copyright?: string
  legalLinks?: FooterLink[]
  newsletterSlot?: React.ReactNode
  className?: string
}

export function Footer({
  brand = 'brand',
  tagline,
  columns = [],
  socialSlot,
  copyright,
  legalLinks = [],
  newsletterSlot,
  className = '',
}: FooterProps) {
  const totalCols = 1 + columns.length + (newsletterSlot ? 1 : 0)

  return (
    <footer
      className={[
        'bg-black text-[#B8B8B8] pt-16 pb-8 px-8 border-t border-[#242424]',
        className,
      ].join(' ')}
    >
      <div
        className="grid gap-12 max-w-[1400px] mx-auto"
        style={{ gridTemplateColumns: `1.4fr repeat(${totalCols - 1}, 1fr)` }}
      >
        {/* Brand column */}
        <div>
          <span className="font-bold text-[24px] leading-none tracking-[-0.03em] lowercase text-white">
            {brand}
          </span>
          {tagline && (
            <p className="mt-4 mb-5 text-[14px] text-[#8A8A8A] max-w-[32ch]">
              {tagline}
            </p>
          )}
          {socialSlot && <div className="flex gap-2">{socialSlot}</div>}
        </div>

        {/* Link columns */}
        {columns.map((col) => (
          <div key={col.heading}>
            <h4 className="m-0 mb-[18px] text-[14px] font-semibold text-white tracking-[-0.018em]">
              {col.heading}
            </h4>
            {col.links.map((link) => (
              <a
                key={link.label}
                href={link.href ?? '#'}
                className="block py-1.5 text-[14px] text-[#B8B8B8] no-underline hover:text-white transition-colors duration-[120ms]"
              >
                {link.label}
              </a>
            ))}
          </div>
        ))}

        {/* Newsletter slot */}
        {newsletterSlot && (
          <div>
            <h4 className="m-0 mb-[18px] text-[14px] font-semibold text-white tracking-[-0.018em]">
              Newsletter
            </h4>
            {newsletterSlot}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="max-w-[1400px] mx-auto mt-12 pt-6 border-t border-[#242424] flex justify-between items-center text-[12px] text-[#5C5C5C]">
        <span>{copyright ?? `© ${new Date().getFullYear()} ${brand}`}</span>
        <div className="flex gap-6">
          {legalLinks.map((link) => (
            <a
              key={link.label}
              href={link.href ?? '#'}
              className="text-[#5C5C5C] no-underline hover:text-white transition-colors duration-[120ms]"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
