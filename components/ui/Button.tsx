'use client';

import Link from 'next/link';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

/**
 * The one "button-like thing" class-builder — an audit found four
 * unrelated hand-rolled button/link stylings (an error-retry button, a
 * suggested-prompt link, a "new chat" link, assorted icon-only squares)
 * each with slightly different padding and hover treatment. `primary` is
 * the one filled CTA color in the app (Ask Atlas, submit actions);
 * `secondary` is a bordered button for a real but non-primary action;
 * `ghost` is for an action that shouldn't visually compete with its
 * surroundings (a toolbar icon button, a quiet inline action).
 */
export function buttonClassName(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className = ''): string {
  const variantClass: Record<ButtonVariant, string> = {
    primary: 'bg-atlas-accent text-white hover:bg-atlas-accent-bright hover:shadow-glow-accent',
    secondary:
      'border border-atlas-border text-atlas-text-secondary hover:border-atlas-accent-bright/40 hover:bg-atlas-surface-hover hover:text-atlas-text',
    ghost: 'text-atlas-text-secondary hover:bg-atlas-surface-hover hover:text-atlas-text',
  };
  const sizeClass: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
  };
  return `atlas-press inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClass[variant]} ${sizeClass[size]} ${className}`;
}

interface ButtonContentProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}

export default function Button({
  variant,
  size,
  className = '',
  children,
  ...rest
}: ButtonContentProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={buttonClassName(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({
  variant,
  size,
  className = '',
  children,
  href,
  ...rest
}: ButtonContentProps & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'href'>) {
  return (
    <Link href={href} className={buttonClassName(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
