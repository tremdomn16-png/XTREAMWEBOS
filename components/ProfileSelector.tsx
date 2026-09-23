'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useProfile } from '@/app/context/ProfileContext';
import { useAuth } from '@/app/context/AuthContext';
import { useT } from '@/app/context/I18nContext';
import { useNavigationOverride } from '@/app/context/NavigationContext';
import { getDeviceClass } from '@/app/lib/device';
import { ADULT_AVATARS, DEFAULT_AVATAR } from '@/app/lib/avatars';
import { inputClassName } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import ProfileAvatar from '@/components/ProfileAvatar';
import ProfileEditModal from '@/components/ProfileEditModal';

/**
 * Plan-derived cap: at least the main+kid pair, at most the hard server cap of 10.
 */
export function maxProfilesForPlan(maxConnections: string | number | undefined): number {
    const n = Number.parseInt(String(maxConnections ?? ''), 10);
    if (!Number.isFinite(n) || n < 2) return 2;
    return Math.min(n, 10);
}

/**
 * Full-screen gate:
 * - `needsCreation` (account has zero profiles): Netflix-style first run —
 *   pick a premium avatar (one pre-selected) + name, then server appends Kid.
 * - `needsSelection` (profiles exist, device never chose): classic picker.
 * - `dismissible` + `onDismiss`: opened from the shell (NavRail) to switch —
 *   same screen, Back/X returns to the app without logging out.
 *
 * Device-aware edit:
 * - TV: "Gerenciar perfis" toggles manage mode; OK/click then opens the editor.
 * - Desktop/mobile: pencil button on each tile opens the editor; tile still selects.
 */
interface ProfileGateProps {
    /** Allow closing without selecting (shell switcher overlay). */
    dismissible?: boolean;
    onDismiss?: () => void;
}

export default function ProfileGate({ dismissible = false, onDismiss }: ProfileGateProps) {
    const {
        profiles,
        selectProfile,
        createProfile,
        needsCreation,
    } = useProfile();
    const { user } = useAuth();
    const t = useT();
    const device = typeof window !== 'undefined' ? getDeviceClass() : 'desktop';
    const isTv = device === 'tv';

    const [name, setName] = useState('');
    const [avatar, setAvatar] = useState<string>(DEFAULT_AVATAR);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [manageMode, setManageMode] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Native Enter activates a <button> on keydown, so holding OK selected the
    // profile before the user could long-press for edit. We suppress that and
    // resolve on keyup: short tap = select (or manage-mode edit), hold = edit.
    const holdTimerRef = useRef<number | null>(null);
    const heldRef = useRef(false);
    // Chip / button that opened a dismissible gate — restored on unmount so
    // the D-pad doesn't land on <body> (and jump to the first page focusable).
    const triggerRef = useRef<HTMLElement | null>(null);

    useEffect(() => () => {
        if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    }, []);

    // Shell switcher: Back dismisses the overlay instead of router.back().
    // The profile editor (Modal) registers a later override while open.
    useNavigationOverride(dismissible && !editingId && onDismiss ? onDismiss : null);

    const isOkKeyEvent = (e: React.KeyboardEvent) => e.key === 'Enter' || e.keyCode === 13;

    const startTileHold = (e: React.KeyboardEvent) => {
        if (!isOkKeyEvent(e)) return;
        // Block native click-on-keydown (and auto-repeat while held).
        e.preventDefault();
        if (e.repeat) return;
        heldRef.current = false;
        if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = window.setTimeout(() => {
            heldRef.current = true;
        }, 500);
    };

    const endTileHold = (e: React.KeyboardEvent, onLongPress: () => void, onTap: () => void) => {
        if (!isOkKeyEvent(e)) return;
        e.preventDefault();
        if (holdTimerRef.current != null) {
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        if (heldRef.current) {
            heldRef.current = false;
            onLongPress();
            return;
        }
        onTap();
    };

    const maxProfiles = maxProfilesForPlan(user?.max_connections);
    const canCreate = needsCreation || profiles.length < maxProfiles;

    // Remote/D-pad needs a visible ring as soon as the gate mounts. Without
    // this, activeElement stays on <body> until the first arrow press, so the
    // screen looks unfocused and "stuck" on a TV. When the gate is the NavRail
    // overlay, the rail chip that opened it still holds focus *behind* the
    // full-screen gate — steal focus unless it is already inside the gate.
    // For a dismissible overlay, remember that chip and put focus back on it
    // when the gate unmounts (Modal.tsx does the same for dialogs).
    useEffect(() => {
        const id = window.requestAnimationFrame(() => {
            const gate = document.querySelector<HTMLElement>(
                '[data-testid="profile-selector"], [data-testid="profile-setup"]'
            );
            if (!gate) return;
            const active = document.activeElement;
            if (dismissible && active instanceof HTMLElement && active !== document.body && !gate.contains(active)) {
                triggerRef.current = active;
            }
            if (active && active !== document.body && gate.contains(active)) return;
            const first = gate.querySelector<HTMLElement>('[data-focusable="true"]');
            first?.focus();
        });
        return () => {
            window.cancelAnimationFrame(id);
            if (!dismissible) return;
            const trigger = triggerRef.current;
            triggerRef.current = null;
            trigger?.focus();
        };
    }, [dismissible]);

    const handleCreate = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setError(t('profiles.nameRequired'));
            return;
        }
        if (!canCreate) {
            setError(t('profiles.limitReached'));
            return;
        }

        setBusy(true);
        try {
            await createProfile(trimmed, { avatar, select: needsCreation });
            setName('');
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : t('profiles.createError'));
        } finally {
            setBusy(false);
        }
    };

    // ── First run: create main profile (Kid is appended by the server) ──────
    if (needsCreation) {
        return (
            <div
                className="fixed inset-0 z-[100] bg-bg flex flex-col items-center justify-center p-6 overflow-y-auto"
                data-testid="profile-setup"
                data-focus-scope="true"
            >
                <div className="w-full max-w-md text-center">
                    <h1 className={`font-semibold text-ink mb-2 ${isTv ? 'text-3xl' : 'text-2xl md:text-3xl'}`}>
                        {t('profiles.setupTitle')}
                    </h1>
                    <p className="text-ink-2 text-sm md:text-base mb-8">
                        {t('profiles.setupSubtitle')}
                    </p>

                    {/* Live preview of the chosen avatar */}
                    <div className="flex justify-center mb-6">
                        <ProfileAvatar
                            avatar={avatar}
                            name={name || '?'}
                            sizeClassName={isTv ? 'w-32 h-32' : 'w-28 h-28'}
                            className="ring-2 ring-line"
                            alt={t('profiles.chooseAvatar')}
                        />
                    </div>

                    <div className="mb-6">
                        <label htmlFor="profile-setup-name" className="sr-only">
                            {t('profiles.namePlaceholder')}
                        </label>
                        <input
                            id="profile-setup-name"
                            autoFocus={!isTv}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleCreate();
                            }}
                            placeholder={t('profiles.namePlaceholder')}
                            data-focusable="true"
                            data-testid="profile-setup-name"
                            maxLength={40}
                            className={`${inputClassName} w-full text-center`}
                        />
                    </div>

                    <p className="text-xs text-ink-3 mb-3">{t('profiles.chooseAvatar')}</p>
                    <div className="flex flex-wrap justify-center -m-2 mb-8">
                        {ADULT_AVATARS.map(id => {
                            const selected = id === avatar;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setAvatar(id)}
                                    data-focusable="true"
                                    data-testid={`avatar-${id}`}
                                    aria-pressed={selected}
                                    tabIndex={0}
                                    className={[
                                        'm-2 rounded-xl p-1 transition-colors',
                                        selected ? 'ring-2 ring-ink' : 'ring-1 ring-transparent hover:ring-line',
                                    ].join(' ')}
                                >
                                    <ProfileAvatar
                                        avatar={id}
                                        sizeClassName={isTv ? 'w-16 h-16' : 'w-14 h-14'}
                                        alt={id}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        loading={busy}
                        onClick={handleCreate}
                        data-testid="profile-setup-submit"
                    >
                        {t('profiles.create')}
                    </Button>
                    <p className="text-xs text-ink-3 mt-4">{t('profiles.kidWillBeAdded')}</p>

                    {error && (
                        <p className="text-brand text-sm mt-4" data-testid="profile-setup-error">{error}</p>
                    )}
                </div>
            </div>
        );
    }

    // ── Existing profiles: who's watching? ─────────────────────────────────
    return (
        <div
            className="fixed inset-0 z-[100] bg-bg flex flex-col items-center justify-center p-6 overflow-y-auto"
            data-testid="profile-selector"
            data-focus-scope="true"
            data-manage-mode={manageMode ? 'on' : 'off'}
        >
            <div className="w-full max-w-4xl flex flex-col items-center">
                <h1 className={`font-semibold text-ink mb-2 ${isTv ? 'text-3xl md:text-5xl' : 'text-2xl md:text-4xl'}`}>
                    {t('profiles.whoWatching')}
                </h1>

                {isTv && (
                    <p className="text-ink-3 text-sm mb-4" data-testid="profile-manage-hint">
                        {manageMode ? t('profiles.doneManage') : t('profiles.manageProfiles')}
                    </p>
                )}

                {/* Flexbox gap spacing needs Chrome 84+ (WebOS TVs lack it): child m-3 plus a
                    negative margin on the container reproduces the same 24px spacing. */}
                <div className="flex flex-wrap justify-center -m-3 w-full">
                    {profiles.map(profile => {
                        const activate = () => {
                            if (isTv && manageMode) {
                                setEditingId(profile.id);
                                return;
                            }
                            selectProfile(profile.id);
                        };

                        return (
                            <div key={profile.id} className="relative m-3">
                                <button
                                    onClick={activate}
                                    onKeyDown={e => startTileHold(e)}
                                    onKeyUp={e => endTileHold(
                                        e,
                                        () => setEditingId(profile.id),
                                        activate,
                                    )}
                                    data-focusable="true"
                                    data-testid={`profile-${profile.isKid ? 'kid' : profile.name.toLowerCase()}`}
                                    tabIndex={0}
                                    className="focus-card flex flex-col items-center space-y-3"
                                >
                                    <span className="focus-card-target relative">
                                        <ProfileAvatar
                                            avatar={profile.avatar}
                                            isKid={profile.isKid}
                                            name={profile.name}
                                            sizeClassName={isTv ? 'w-36 h-36' : 'w-24 h-24 md:w-32 md:h-32'}
                                            className={profile.isKid ? 'ring-2 ring-ok/50' : ''}
                                            alt={profile.name}
                                        />
                                        {isTv && manageMode && (
                                            <span
                                                className="absolute -bottom-1 -right-1 rounded-full bg-ink text-bg p-1.5"
                                                aria-hidden="true"
                                            >
                                                <Pencil size={14} />
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-ink-2 text-sm md:text-base font-medium">
                                        {profile.isKid ? t('profiles.kidName', { name: profile.name }) : profile.name}
                                    </span>
                                </button>

                                {/* Desktop/mobile: explicit edit affordance (TV uses manage + OK). */}
                                {!isTv && (
                                    <button
                                        type="button"
                                        onClick={() => setEditingId(profile.id)}
                                        data-focusable="true"
                                        data-testid={`profile-edit-${profile.isKid ? 'kid' : profile.name.toLowerCase()}`}
                                        aria-label={t('profiles.editLabel', { name: profile.name })}
                                        title={t('profiles.editLabel', { name: profile.name })}
                                        tabIndex={0}
                                        // z-40: a focused tile lifts to z-30 (globals.css :focus);
                                        // the pencil must stay above it or OK/click hits the avatar.
                                        className="absolute top-0 right-0 md:-top-1 md:-right-1 z-40 rounded-full bg-surface-2 border border-line text-ink-2 hover:text-ink p-2"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {canCreate && profiles.length > 0 && (
                        <CreateTile
                            isTv={isTv}
                            name={name}
                            avatar={avatar}
                            busy={busy}
                            error={error}
                            onName={setName}
                            onAvatar={setAvatar}
                            onSubmit={handleCreate}
                            onCancel={() => { setName(''); setError(null); }}
                            labels={{
                                add: t('profiles.addProfile'),
                                placeholder: t('profiles.namePlaceholder'),
                                create: t('profiles.create'),
                                chooseAvatar: t('profiles.chooseAvatar'),
                            }}
                        />
                    )}
                </div>

                {isTv && (
                    <div className="mt-8 flex items-center space-x-3">
                        <Button
                            variant={manageMode ? 'primary' : 'secondary'}
                            size="lg"
                            onClick={() => setManageMode(prev => !prev)}
                            data-testid="profile-manage"
                        >
                            {manageMode ? t('profiles.doneManage') : t('profiles.manageProfiles')}
                        </Button>
                        {dismissible && onDismiss && (
                            <Button variant="ghost" size="lg" onClick={onDismiss} data-testid="profile-selector-close">
                                {t('profiles.cancel')}
                            </Button>
                        )}
                    </div>
                )}

                {!isTv && dismissible && onDismiss && (
                    <div className="mt-6">
                        <Button variant="ghost" onClick={onDismiss} data-testid="profile-selector-close">
                            {t('profiles.cancel')}
                        </Button>
                    </div>
                )}

                {error && !busy && <p className="text-brand text-sm mt-6">{error}</p>}
            </div>

            {editingId && (
                <ProfileEditModal
                    profileId={editingId}
                    onClose={() => setEditingId(null)}
                />
            )}
        </div>
    );
}

interface CreateTileProps {
    isTv: boolean;
    name: string;
    avatar: string;
    busy: boolean;
    error: string | null;
    onName: (v: string) => void;
    onAvatar: (v: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    labels: {
        add: string;
        placeholder: string;
        create: string;
        chooseAvatar: string;
    };
}

function CreateTile({
    isTv,
    name,
    avatar,
    busy,
    onName,
    onAvatar,
    onSubmit,
    onCancel,
    labels,
}: CreateTileProps) {
    const [open, setOpen] = useState(false);

    if (!open) {
        return (
            <div className="m-3">
                <button
                    onClick={() => setOpen(true)}
                    data-focusable="true"
                    data-testid="profile-add"
                    tabIndex={0}
                    className="focus-card flex flex-col items-center space-y-3"
                >
                    <div
                        className={[
                            'focus-card-target rounded-xl bg-surface-2 border border-line flex items-center justify-center',
                            isTv ? 'w-36 h-36' : 'w-24 h-24 md:w-32 md:h-32',
                        ].join(' ')}
                    >
                        <span className="text-4xl text-ink-3">+</span>
                    </div>
                    <span className="text-ink-2 text-sm md:text-base font-medium">{labels.add}</span>
                </button>
            </div>
        );
    }

    return (
        <div className="m-3 flex flex-col items-center space-y-3 w-48">
            <div className="flex flex-wrap justify-center -m-1 mb-1">
                {ADULT_AVATARS.slice(0, 6).map(id => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onAvatar(id)}
                        data-focusable="true"
                        data-testid={`create-avatar-${id}`}
                        tabIndex={0}
                        className={[
                            'm-1 rounded-lg p-0.5',
                            id === avatar ? 'ring-2 ring-ink' : 'ring-1 ring-transparent',
                        ].join(' ')}
                    >
                        <ProfileAvatar avatar={id} sizeClassName="w-10 h-10" alt={id} />
                    </button>
                ))}
            </div>
            <input
                autoFocus={!isTv}
                value={name}
                onChange={e => onName(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') onSubmit();
                    if (e.key === 'Escape') onCancel();
                }}
                placeholder={labels.placeholder}
                data-focusable="true"
                data-testid="profile-new-input"
                tabIndex={0}
                className={`${inputClassName} w-full text-center`}
            />
            <div className="flex space-x-2 w-full">
                <Button size="sm" variant="ghost" onClick={onCancel} data-testid="profile-add-cancel">
                    {labels.chooseAvatar}
                </Button>
                <Button
                    size="sm"
                    variant="primary"
                    loading={busy}
                    onClick={onSubmit}
                    data-testid="profile-add-submit"
                    className="flex-1"
                >
                    {labels.create}
                </Button>
            </div>
        </div>
    );
}
