'use client'

import React from 'react'

export type ButtonVariant = 'primary' | 'dark' | 'ghost' | 'light' | 'link' | 'icon'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const BASE =
  'inline-flex items-center justify-center gap-2 font-semibold leading-none ' +
  'cursor-pointer whitespace-nowrap select-none border border-transparent ' +
  'transition-[background-color,color,border-color,transform] ' +
  'duration-[120ms] ease-[cubic-bezier(.22,.61,.36,1)] ' +
  'active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'rounded-[4px] bg-[#78E825] text-[#0E1F00] hover:bg-[#86FF2B] active:bg-[#62C41D]',
  dark:    'rounded-[4px] bg-white text-black hover:bg-[#E5E5E5]',
  ghost:   'rounded-[4px] bg-transparent text-white border-[#3A3A3A] hover:border-white hover:bg-white/[0.04]',
  light:   'rounded-[4px] bg-black text-white hover:bg-[#1C1C1C]',
  link:    'bg-transparent text-white px-0 py-1 rounded-none border-0 border-b-2 border-[#78E825] hover:text-[#78E825]',
  icon:    'w-10 h-10 p-0 rounded-full bg-transparent text-white border-[#3A3A3A] hover:border-white hover:bg-white/[0.06]',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-[14px] py-[10px] text-[13px]',
  md: 'px-[22px] py-[14px] text-[14px]',
  lg: 'px-[28px] py-[18px] text-[16px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const noSize = variant === 'icon' || variant === 'link'
  return (
    <button
      {...props}
      className={[BASE, VARIANTS[variant], noSize ? '' : SIZES[size], className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  )
}
