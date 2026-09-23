'use client';

/**
 * Premium profile avatar catalog — local SVGs, never emoji.
 *
 * Ids are stable and stored on the profile row (`profiles.avatar`).
 * `kid-*` is reserved for the auto-created child profile and must never
 * collide with the adult set.
 */

export const ADULT_AVATARS = [
    'av-1',
    'av-2',
    'av-3',
    'av-4',
    'av-5',
    'av-6',
    'av-7',
    'av-8',
    'av-9',
    'av-10',
] as const;

export const KID_AVATARS = ['kid-1', 'kid-2'] as const;

export const ALL_AVATARS: string[] = [...ADULT_AVATARS, ...KID_AVATARS];

export const DEFAULT_AVATAR = 'av-1';
export const DEFAULT_KID_AVATAR = 'kid-1';

export function isKnownAvatar(id: string): boolean {
    return ALL_AVATARS.indexOf(id) !== -1;
}

export function isKidAvatar(id: string | null | undefined): boolean {
    return !!id && id.indexOf('kid-') === 0;
}

/** Catalog ids a given profile kind is allowed to use. */
export function avatarsForProfile(isKid: boolean): string[] {
    return isKid ? [...KID_AVATARS] : [...ADULT_AVATARS];
}

/**
 * Coerce any stored/requested avatar to one that matches the profile kind.
 * Kid rows only ever resolve to `kid-*`; adult rows never do.
 */
export function normalizeAvatar(id: string | null | undefined, isKid: boolean): string {
    const fallback = isKid ? DEFAULT_KID_AVATAR : DEFAULT_AVATAR;
    if (!id || !isKnownAvatar(id)) return fallback;
    if (isKid) return isKidAvatar(id) ? id : DEFAULT_KID_AVATAR;
    return isKidAvatar(id) ? DEFAULT_AVATAR : id;
}

export function avatarSrc(id: string | null | undefined, isKid = false): string {
    return `/avatars/${normalizeAvatar(id, isKid)}.svg`;
}

/** Next free avatar for a new profile (cycles through the adult set). */
export function nextAvatarId(existing: string[]): string {
    for (const id of ADULT_AVATARS) {
        if (existing.indexOf(id) === -1) return id;
    }
    return DEFAULT_AVATAR;
}
