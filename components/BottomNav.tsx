'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Film, Layers, Tv, Settings } from 'lucide-react';
import { useT } from '@/app/context/I18nContext';

/**
 * Phone tab bar — Netflix-style primary destinations.
 * Live stays here so channel apps are one tap away; admin (devices, pairing,
 * sync) lives under Ajustes. TV Mode is reached from Ajustes.
 */
const mobileLinks = [
    { labelKey: 'home', icon: Home, path: '/dashboard' },
    { labelKey: 'search', icon: Search, path: '/dashboard/search' },
    { labelKey: 'movies', icon: Film, path: '/dashboard/movies' },
    { labelKey: 'series', icon: Layers, path: '/dashboard/series' },
    { labelKey: 'live', icon: Tv, path: '/dashboard/live' },
    { labelKey: 'settings', icon: Settings, path: '/dashboard/settings' },
];

export default function BottomNav() {
    const pathname = usePathname();
    const t = useT();

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-line flex items-center justify-around h-16 px-1 z-[60] md:hidden">
            {mobileLinks.map((link) => {
                const Icon = link.icon;
                const isActive = link.path === '/dashboard' ? pathname === link.path : pathname.startsWith(link.path);

                return (
                    <Link
                        key={link.path}
                        href={link.path}
                        data-focusable="true"
                        tabIndex={0}
                        aria-current={isActive ? 'page' : undefined}
                        className={[
                            'flex flex-col items-center justify-center flex-1 min-w-0 py-1 relative rounded-lg',
                            isActive ? 'text-ink' : 'text-ink-3',
                        ].join(' ')}
                    >
                        <Icon size={20} />
                        <span className="text-[10px] mt-1 font-medium truncate max-w-full px-0.5">
                            {t(`nav.${link.labelKey}`)}
                        </span>
                        {isActive && <span className="absolute top-0 w-8 h-0.5 bg-brand rounded-full" />}
                    </Link>
                );
            })}
        </nav>
    );
}
