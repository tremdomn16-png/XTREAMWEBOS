'use client';

import { avatarSrc } from '@/app/lib/avatars';

interface ProfileAvatarProps {
    avatar?: string | null;
    /** Kid rows must resolve to the kid catalog, never the adult bust. */
    isKid?: boolean;
    name?: string;
    /** Tailwind size classes for the square (e.g. `w-24 h-24`). */
    sizeClassName?: string;
    className?: string;
    /** Accessible/alt text — defaults to the profile name. */
    alt?: string;
}

/**
 * Square premium avatar image with a letter fallback when the asset is missing.
 * Used everywhere a profile is shown (gate, settings, nav rail, modal).
 */
export default function ProfileAvatar({
    avatar,
    isKid = false,
    name,
    sizeClassName = 'w-12 h-12',
    className = '',
    alt,
}: ProfileAvatarProps) {
    const label = alt ?? name ?? '';
    const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
    const src = avatarSrc(avatar, isKid);

    return (
        <span
            className={[
                'relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-surface-2 flex-shrink-0',
                sizeClassName,
                className,
            ].join(' ')}
        >
            {/* Local SVG avatar: next/image adds no value for tiny inline assets. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={label}
                draggable={false}
                data-avatar-id={src.replace(/^\/avatars\//, '').replace(/\.svg$/, '')}
                className="absolute inset-0 w-full h-full object-cover"
            />
            {!avatar && (
                <span className="relative text-ink font-semibold">{initial}</span>
            )}
        </span>
    );
}
