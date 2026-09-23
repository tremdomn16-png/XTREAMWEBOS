'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useProfile, Profile } from '@/app/context/ProfileContext';
import { useT } from '@/app/context/I18nContext';
import Modal from '@/components/ui/Modal';
import Field, { inputClassName } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import ProfileAvatar from '@/components/ProfileAvatar';
import { avatarsForProfile } from '@/app/lib/avatars';

interface ProfileEditModalProps {
    profile: Profile;
    onClose: () => void;
}

/**
 * Single-profile editor: image (catalog only), rename, delete.
 * Rules: Kid never uses adult art and can never be deleted; the last profile
 * cannot be deleted either (server enforces both — this UI mirrors them).
 */
function ProfileEditForm({ profile, onClose }: ProfileEditModalProps) {
    const { profiles, renameProfile, updateProfileAvatar, deleteProfile } = useProfile();
    const t = useT();

    const [name, setName] = useState(profile.name);
    const [avatar, setAvatar] = useState(profile.avatar);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const choices = avatarsForProfile(profile.isKid);
    const canDelete = !profile.isKid && profiles.length > 1;

    const handleRename = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setError(t('profiles.nameRequired'));
            return;
        }
        setBusy(true);
        try {
            await renameProfile(profile.id, trimmed);
            setError(null);
            onClose();
        } catch {
            setError(t('profiles.renameError'));
        } finally {
            setBusy(false);
        }
    };

    const handleAvatar = async (id: string) => {
        if (id === avatar) return;
        const previous = avatar;
        setAvatar(id);
        try {
            await updateProfileAvatar(profile.id, id);
            setError(null);
        } catch {
            setAvatar(previous);
            setError(t('profiles.avatarError'));
        }
    };

    const handleDelete = async () => {
        if (!canDelete) return;
        setBusy(true);
        try {
            const failure = await deleteProfile(profile.id);
            if (failure) {
                setError(failure);
                setConfirmDelete(false);
            } else {
                onClose();
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={t('profiles.editProfile')}
            description={profile.isKid ? t('profiles.kidName', { name: profile.name }) : profile.name}
            size="sm"
        >
            <div data-testid="profile-edit-form" className="space-y-5">
                <div className="flex justify-center">
                    <ProfileAvatar
                        avatar={avatar}
                        isKid={profile.isKid}
                        name={name || profile.name}
                        sizeClassName="w-28 h-28"
                        className="ring-2 ring-line"
                        alt={name || profile.name}
                    />
                </div>

                <div>
                    <p className="text-xs text-ink-3 mb-2">{t('profiles.chooseAvatar')}</p>
                    <div className="flex flex-wrap justify-center -m-1.5">
                        {choices.map(id => {
                            const selected = id === avatar;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => void handleAvatar(id)}
                                    data-focusable="true"
                                    data-testid={`profile-edit-avatar-${id}`}
                                    aria-pressed={selected}
                                    tabIndex={0}
                                    className={[
                                        'm-1.5 rounded-xl p-1 transition-colors',
                                        selected ? 'ring-2 ring-ink' : 'ring-1 ring-transparent hover:ring-line',
                                    ].join(' ')}
                                >
                                    <ProfileAvatar
                                        avatar={id}
                                        isKid={profile.isKid}
                                        sizeClassName="w-14 h-14"
                                        alt={id}
                                    />
                                </button>
                            );
                        })}
                    </div>
                </div>

                <Field label={t('profiles.namePlaceholder')} htmlFor="profile-edit-name">
                    <input
                        id="profile-edit-name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') void handleRename();
                        }}
                        data-focusable="true"
                        data-testid="profile-edit-name"
                        tabIndex={0}
                        maxLength={40}
                        className={inputClassName}
                    />
                </Field>

                <div className="flex items-center space-x-2">
                    <Button
                        variant="primary"
                        loading={busy}
                        onClick={() => void handleRename()}
                        data-testid="profile-edit-save"
                        className="flex-1"
                    >
                        {t('profiles.saveChanges')}
                    </Button>
                    <Button variant="ghost" onClick={onClose} data-testid="profile-edit-close">
                        {t('profiles.cancel')}
                    </Button>
                </div>

                {canDelete && (
                    <div className="border-t border-line pt-4">
                        {confirmDelete ? (
                            <div className="flex items-center space-x-2">
                                <p className="text-sm text-ink flex-1">
                                    {t('profiles.deleteConfirm', { name: profile.name })}
                                </p>
                                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                                    {t('profiles.cancel')}
                                </Button>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    loading={busy}
                                    onClick={() => void handleDelete()}
                                    data-testid="profile-edit-delete-confirm"
                                >
                                    {t('profiles.delete')}
                                </Button>
                            </div>
                        ) : (
                            <Button
                                variant="danger"
                                icon={Trash2}
                                onClick={() => setConfirmDelete(true)}
                                data-testid="profile-edit-delete"
                            >
                                {t('profiles.deleteLabel', { name: profile.name })}
                            </Button>
                        )}
                    </div>
                )}

                {error && (
                    <p className="text-brand text-sm" data-testid="profile-edit-error">{error}</p>
                )}
            </div>
        </Modal>
    );
}

interface ProfileEditModalPropsWrapper {
    profileId: string;
    onClose: () => void;
}

/** Looks up the live profile so renames/deletes refresh while open. */
export default function ProfileEditModal({ profileId, onClose }: ProfileEditModalPropsWrapper) {
    const { profiles } = useProfile();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return null;
    // Remount when the target changes so local form state never leaks across profiles.
    return <ProfileEditForm key={profile.id} profile={profile} onClose={onClose} />;
}
