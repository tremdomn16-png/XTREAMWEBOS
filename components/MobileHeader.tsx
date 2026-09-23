'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { useT } from '@/app/context/I18nContext';
import { useProfile } from '@/app/context/ProfileContext';
import ProfileAvatar from './ProfileAvatar';

/**
 * Phone-only top bar (Netflix-style): brand left, search + profile right.
 * Sits outside the scroll container so it stays put while content scrolls.
 */
export default function MobileHeader() {
    const t = useT();
    const pathname = usePathname();
    const { activeProfile, openSelector } = useProfile();
    const searchActive = pathname.startsWith('/dashboard/search');

    return (
        <header className="md:hidden flex items-center justify-between px-4 h-14 bg-bg/95 border-b border-line flex-shrink-0 z-[55]">
            <Link
                href="/dashboard"
                data-focusable="true"
                tabIndex={0}
                className="flex items-center min-w-0"
                aria-label={t('nav.home')}
            >
                <span className="text-xl font-black text-brand tracking-tighter leading-none">X</span>
                <span className="text-xl font-black text-ink tracking-tighter leading-none">stream</span>
            </Link>

            <div className="flex items-center space-x-2">
                <Link
                    href="/dashboard/search"
                    data-focusable="true"
                    tabIndex={0}
                    aria-label={t('nav.search')}
                    aria-current={searchActive ? 'page' : undefined}
                    className={[
                        'w-10 h-10 rounded-full flex items-center justify-center',
                        searchActive ? 'text-ink bg-surface-2' : 'text-ink-2',
                    ].join(' ')}
                >
                    <Search size={20} />
                </Link>

                <button
                    type="button"
                    onClick={openSelector}
                    data-focusable="true"
                    data-testid="mobile-profile"
                    tabIndex={0}
                    title={t('nav.switchProfile')}
                    aria-label={t('nav.switchProfile')}
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                >
                    <ProfileAvatar
                        avatar={activeProfile?.avatar}
                        isKid={activeProfile?.isKid}
                        name={activeProfile?.name}
                        sizeClassName="w-8 h-8"
                        className="rounded-lg"
                        alt={activeProfile?.name ?? ''}
                    />
                </button>
            </div>
        </header>
    );
}
