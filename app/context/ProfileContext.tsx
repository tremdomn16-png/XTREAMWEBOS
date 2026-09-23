'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiFetch } from '../lib/apiClient';
import { useAuth } from './AuthContext';

export interface ProfilePrefs {
    subtitleLanguage: string;
    subtitleFontSize: number;
}

export interface Profile {
    id: string;
    name: string;
    avatar: string;
    isKid: boolean;
    account: string;
    prefs: ProfilePrefs;
}

interface CreateProfileResult {
    /** Full list after create (includes auto Kid when it was the first profile). */
    profiles: Profile[];
    created: Profile;
    kidCreated: boolean;
}

interface ProfileState {
    profiles: Profile[];
    activeProfile: Profile | null;
    isLoaded: boolean;
    /** True when this account has no profiles yet — force onboarding create. */
    needsCreation: boolean;
    /** True when this device never picked a profile and more than one exists. */
    needsSelection: boolean;
    /**
     * Full-screen "who's watching" opened from the shell (NavRail profile chip).
     * Distinct from needsSelection: the device already has a profile, we are
     * just switching / managing — same screen as the first-run picker.
     */
    selectorOpen: boolean;
    openSelector: () => void;
    closeSelector: () => void;
    selectProfile: (id: string) => void;
    /** Creates one profile; server may append Kid on the first normal create. */
    createProfile: (
        name: string,
        options?: { avatar?: string; isKid?: boolean; select?: boolean }
    ) => Promise<CreateProfileResult>;
    renameProfile: (id: string, name: string) => Promise<void>;
    updateProfileAvatar: (id: string, avatar: string) => Promise<void>;
    deleteProfile: (id: string) => Promise<string | null>;
    updatePrefs: (prefs: Partial<ProfilePrefs>) => Promise<void>;
}

const ProfileContext = createContext<ProfileState | undefined>(undefined);

export const PROFILE_COOKIE_NAME = 'xstream_profile';

// The API routes read the active profile from this cookie, so every request
// already carries it — no client code needs to pass a profile id around.
// The localStorage mirror exists for origins where cookies do not survive
// (the packaged TV client), where apiFetch sends it as X-Xstream-Profile.
function writeProfileCookie(id: string) {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${PROFILE_COOKIE_NAME}=${id}; path=/; max-age=${oneYear}; SameSite=Lax`;
    try {
        localStorage.setItem(PROFILE_COOKIE_NAME, id);
    } catch {
        /* storage unavailable — the cookie alone is enough on the web */
    }
}

function readProfileCookie(): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|; )${PROFILE_COOKIE_NAME}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

export const ProfileProvider = ({ children }: { children: ReactNode }) => {
    const { isAuthenticated, isLoading: authLoading, user } = useAuth();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [hasPicked, setHasPicked] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [selectorOpen, setSelectorOpen] = useState(false);
    // IPTV account scopes `/api/profiles`; re-fetch when login completes.
    const account = user?.username ?? '';

    useEffect(() => {
        if (authLoading) return;

        // Not logged in yet: keep providers quiet (gate is auth-gated too).
        if (!isAuthenticated) {
            setProfiles([]);
            setActiveId(null);
            setHasPicked(false);
            setIsLoaded(true);
            setSelectorOpen(false);
            return;
        }

        let cancelled = false;
        const load = async () => {
            try {
                const res = await apiFetch('/api/profiles');
                if (cancelled) return;
                if (res.ok) {
                    const { data } = await res.json() as { data: Profile[] };
                    setProfiles(data);

                    const cookieId = readProfileCookie();
                    const picked = data.find(p => p.id === cookieId) ?? null;

                    // Without a cookie the server falls back to the first profile,
                    // so the client has to fall back to the same one to stay in sync.
                    setActiveId((picked ?? data[0])?.id ?? null);
                    setHasPicked(picked !== null);
                }
            } catch (e) {
                console.error('[Profiles] Failed to load profiles', e);
            } finally {
                if (!cancelled) setIsLoaded(true);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [authLoading, isAuthenticated, account]);

    const openSelector = useCallback(() => setSelectorOpen(true), []);
    const closeSelector = useCallback(() => setSelectorOpen(false), []);

    const selectProfile = useCallback((id: string) => {
        writeProfileCookie(id);
        setActiveId(id);
        setHasPicked(true);
        setSelectorOpen(false);
    }, []);

    const createProfile = useCallback(async (
        name: string,
        options?: { avatar?: string; isKid?: boolean; select?: boolean }
    ): Promise<CreateProfileResult> => {
        const res = await apiFetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create',
                name,
                avatar: options?.avatar,
                isKid: options?.isKid,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({})) as { error?: string };
            throw new Error(body.error || 'Falha ao criar perfil');
        }
        const body = await res.json() as {
            data: Profile;
            profiles?: Profile[];
            kidCreated?: boolean;
        };

        const next = body.profiles ?? [...profiles, body.data];
        setProfiles(next);

        // Onboarding: enter the app as the profile just created. Manual "add"
        // keeps the current selection so the user can pick explicitly.
        if (options?.select) {
            writeProfileCookie(body.data.id);
            setActiveId(body.data.id);
            setHasPicked(true);
        }

        return {
            profiles: next,
            created: body.data,
            kidCreated: body.kidCreated === true,
        };
    }, [profiles]);

    const renameProfile = useCallback(async (id: string, name: string) => {
        const res = await apiFetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update', id, name })
        });
        if (!res.ok) throw new Error('Falha ao renomear perfil');
        const { data } = await res.json() as { data: Profile };
        setProfiles(prev => prev.map(p => (p.id === id ? data : p)));
    }, []);

    const updateProfileAvatar = useCallback(async (id: string, avatar: string) => {
        const res = await apiFetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update', id, avatar })
        });
        if (!res.ok) throw new Error('Falha ao atualizar avatar');
        const { data } = await res.json() as { data: Profile };
        setProfiles(prev => prev.map(p => (p.id === id ? data : p)));
    }, []);

    const deleteProfile = useCallback(async (id: string): Promise<string | null> => {
        const res = await apiFetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', id })
        });
        if (!res.ok) {
            const { error } = await res.json() as { error?: string };
            return error ?? 'Falha ao excluir perfil';
        }

        const remaining = profiles.filter(p => p.id !== id);
        setProfiles(remaining);
        if (activeId === id && remaining[0]) {
            selectProfile(remaining[0].id);
        }
        return null;
    }, [profiles, activeId, selectProfile]);

    const updatePrefs = useCallback(async (prefs: Partial<ProfilePrefs>) => {
        if (!activeId) return;

        // Optimistic: preference changes come from UI controls (font size steps,
        // language picker) that must feel immediate.
        setProfiles(prev => prev.map(p => (
            p.id === activeId ? { ...p, prefs: { ...p.prefs, ...prefs } } : p
        )));

        try {
            await apiFetch('/api/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update', id: activeId, prefs })
            });
        } catch (e) {
            console.error('[Profiles] Failed to save preferences', e);
        }
    }, [activeId]);

    const activeProfile = profiles.find(p => p.id === activeId) ?? null;
    // Account with zero profiles → forced create (Netflix-style first run).
    const needsCreation = isLoaded && profiles.length === 0;
    // Existing profiles but this device never chose → picker (only if >0; single
    // profile auto-selects via data[0] fallback above when cookie is absent… but
    // hasPicked stays false, so gate would block. Auto-pick when only one exists.
    const needsSelection = isLoaded
        && !hasPicked
        && profiles.length > 1
        && !needsCreation;
    // One profile and no cookie: treat as picked so the app opens (server falls
    // back to profiles[0] too). Cookie is written on first selectProfile call.
    const autoSingle = isLoaded && !hasPicked && profiles.length === 1;
    const gatedNeedsSelection = needsSelection || (autoSingle && false);

    // Auto-cookie the only profile so favorites/progress resolve consistently.
    useEffect(() => {
        if (autoSingle && profiles[0] && !readProfileCookie()) {
            writeProfileCookie(profiles[0].id);
            setHasPicked(true);
            setActiveId(profiles[0].id);
        }
    }, [autoSingle, profiles]);

    return (
        <ProfileContext.Provider value={{
            profiles,
            activeProfile,
            isLoaded,
            needsSelection: gatedNeedsSelection,
            needsCreation,
            selectorOpen,
            openSelector,
            closeSelector,
            selectProfile,
            createProfile,
            renameProfile,
            updateProfileAvatar,
            deleteProfile,
            updatePrefs
        }}>
            {children}
        </ProfileContext.Provider>
    );
};

export const useProfile = () => {
    const context = useContext(ProfileContext);
    if (context === undefined) {
        throw new Error('useProfile must be used within a ProfileProvider');
    }
    return context;
};
