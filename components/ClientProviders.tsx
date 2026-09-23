'use client';

import { usePathname } from 'next/navigation';
import TvNavigationProvider from '@/components/TvNavigationProvider';
import { AuthProvider } from '../app/context/AuthContext';
import { FavoritesProvider } from '../app/context/FavoritesContext';

import { DataProvider } from '../app/context/DataContext';
import { WatchProgressProvider } from '../app/context/WatchProgressContext';
import { TMDbProvider } from '../app/context/TMDbContext';
import { SubtitleProvider } from '../app/context/SubtitleContext';
import { ProfileProvider, useProfile } from '../app/context/ProfileContext';
import { useAuth } from '../app/context/AuthContext';
import ProfileGate from '@/components/ProfileSelector';

/**
 * Favorites and watch progress are loaded once on mount from the profile the
 * cookie points at, so switching profiles has to remount them — the key does
 * that without either context knowing profiles exist.
 */
function ProfileScopedProviders({ children }: { children: React.ReactNode }) {
    const { activeProfile, isLoaded, needsSelection, needsCreation, selectorOpen, closeSelector } = useProfile();
    const { isAuthenticated, isLoading: authLoading } = useAuth();

    // Mounting the data providers before the active profile is known would make
    // them fetch for the wrong profile and immediately remount.
    if (!isLoaded || authLoading) return null;

    // Gates only apply to a logged-in IPTV session (never on the login page).
    // ProfileGate must sit under TvNavigationProvider: ProfileEditModal → Modal
    // calls useNavigationContext, which throws without NavigationProvider.
    if (isAuthenticated && needsCreation) {
        return (
            <TvNavigationProvider>
                <ProfileGate />
            </TvNavigationProvider>
        );
    }
    if (isAuthenticated && needsSelection) {
        return (
            <TvNavigationProvider>
                <ProfileGate />
            </TvNavigationProvider>
        );
    }

    return (
        <TvNavigationProvider>
            <FavoritesProvider key={activeProfile?.id ?? 'none'}>
                <WatchProgressProvider>
                    <TMDbProvider>
                        <SubtitleProvider>
                            {children}
                        </SubtitleProvider>
                    </TMDbProvider>
                </WatchProgressProvider>
            </FavoritesProvider>

            {/* Shell switcher (NavRail chip): same full-screen picker as an
                overlay so Back/select dismisses without tearing down providers. */}
            {isAuthenticated && selectorOpen && (
                <ProfileGate dismissible onDismiss={closeSelector} />
            )}
        </TvNavigationProvider>
    );
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    if (
        pathname === '/debug' ||
        pathname?.startsWith('/debug/')
    ) {
        return <>{children}</>;
    }

    return (
        <AuthProvider>
            <DataProvider>
                <ProfileProvider>
                    <ProfileScopedProviders>
                        {children}
                    </ProfileScopedProviders>
                </ProfileProvider>
            </DataProvider>
        </AuthProvider>
    );
}
