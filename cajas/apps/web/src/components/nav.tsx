'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const ICONS: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  box: 'M3 7h18v13H3zM3 11h18M9 3h6l1 4H8z',
  inbox: 'M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 13h5l1 3h6l1-3h5',
  spark: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
  cog: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  lock: 'M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 11a2.5 2.5 0 1 0 0-5M17 14c3 0 5 2 5 5',
};
export const Icon = ({ name, size = 20 }: { name: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none"><path d={ICONS[name] ?? ''} /></svg>
);

function useActive(href: string): boolean {
  const p = usePathname();
  return href === '/' ? p === '/' : p === href || p.startsWith(href + '/');
}

export function RailLink({ href, icon, children, badge }: { href: string; icon: string; children: ReactNode; badge?: number }) {
  const active = useActive(href);
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 font-semibold ${active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:bg-surface'}`}>
      <Icon name={icon} />
      <span>{children}</span>
      {!!badge && <span className="ml-auto min-w-[22px] rounded-full bg-accent px-2 text-center text-xs font-bold text-accent-ink">{badge}</span>}
    </Link>
  );
}

export function CajaLink({ href, color, shared, children }: { href: string; color: string; shared: boolean; children: ReactNode }) {
  const active = useActive(href);
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 ${active ? 'bg-surface font-bold' : 'font-medium hover:bg-surface'}`}>
      <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="text-muted"><Icon name={shared ? 'users' : 'lock'} size={15} /></span>
    </Link>
  );
}

export function TabLink({ href, icon, children, badge }: { href: string; icon: string; children: ReactNode; badge?: number }) {
  const active = useActive(href);
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`relative flex flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 text-[11px] font-semibold ${active ? 'text-accent' : 'text-muted'}`}>
      <Icon name={icon} size={22} />
      {children}
      {!!badge && <span className="absolute left-[calc(50%+4px)] top-0 min-w-4 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-ink">{badge}</span>}
    </Link>
  );
}
