'use client';

import Link from 'next/link';
import { Tv, Film, Layers, Clapperboard, LucideIcon } from 'lucide-react';
import { useT } from '@/app/context/I18nContext';

interface Shortcut {
    href: string;
    labelKey: string;
    icon: LucideIcon;
}

// Category chips under the hero — Netflix-style genre row, not photo cards.
const SHORTCUTS: Shortcut[] = [
    { href: '/dashboard/live', labelKey: 'shortcuts.live', icon: Tv },
    { href: '/dashboard/movies', labelKey: 'shortcuts.movies', icon: Film },
    { href: '/dashboard/series', labelKey: 'shortcuts.series', icon: Layers },
    { href: '/dashboard/favorites', labelKey: 'shortcuts.myList', icon: Clapperboard },
];

export default function HomeShortcuts() {
    const t = useT();

    return (
        <div className="flex flex-wrap">
            {SHORTCUTS.map(({ href, labelKey, icon: Icon }) => (
                <Link
                    key={href}
                    href={href}
                    data-focusable="true"
                    tabIndex={0}
                    className="h-11 px-4 mr-3 mb-3 rounded-full bg-surface-2 border border-line flex items-center text-ink hover:bg-surface-3 transition-colors"
                >
                    <Icon size={16} className="mr-2 flex-shrink-0" />
                    <span className="text-sm font-medium whitespace-nowrap">{t(labelKey)}</span>
                </Link>
            ))}
        </div>
    );
}
