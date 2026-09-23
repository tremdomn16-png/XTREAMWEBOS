'use client';

import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useProfile } from '@/app/context/ProfileContext';
import { useT } from '@/app/context/I18nContext';
import Modal from '@/components/ui/Modal';
import Field, { inputClassName } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Badge from '@/components/ui/Badge';
import ProfileAvatar from '@/components/ProfileAvatar';
import ProfileEditModal from '@/components/ProfileEditModal';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Profile switcher / manager (NavRail). Row pencil opens ProfileEditModal
 * (image + rename + delete). Kid rows never show delete — only the editor's
 * rules apply, and the server rejects Kid deletes anyway.
 */
export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { profiles, activeProfile, selectProfile, createProfile } = useProfile();
    const t = useT();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        const trimmed = newName.trim();
        if (!trimmed) return;

        try {
            await createProfile(trimmed, { select: false });
            setNewName('');
            setError(null);
        } catch {
            setError(t('profiles.createError'));
        }
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={t('profiles.title')} size="sm">
                <div className="space-y-2 mb-6" data-testid="profile-modal-list">
                    {profiles.map(profile => {
                        const isActive = profile.id === activeProfile?.id;

                        return (
                            <div
                                key={profile.id}
                                className={`rounded-xl border ${isActive ? 'bg-brand-soft border-brand' : 'bg-surface border-line'}`}
                            >
                                <div className="flex items-center space-x-3 px-3 py-2.5">
                                    <ProfileAvatar
                                        avatar={profile.avatar}
                                        isKid={profile.isKid}
                                        name={profile.name}
                                        sizeClassName="w-9 h-9"
                                        className={profile.isKid ? 'ring-1 ring-ok/40' : ''}
                                        alt={profile.name}
                                    />

                                    <button
                                        onClick={() => {
                                            selectProfile(profile.id);
                                            onClose();
                                        }}
                                        data-focusable="true"
                                        data-profile-select={profile.id}
                                        data-testid={`profile-modal-${profile.isKid ? 'kid' : profile.name.toLowerCase()}`}
                                        tabIndex={0}
                                        className="flex-1 text-left text-sm font-medium text-ink"
                                    >
                                        {profile.isKid ? t('profiles.kidName', { name: profile.name }) : profile.name}
                                    </button>

                                    {isActive && <Badge tone="ok">{t('profiles.active')}</Badge>}

                                    <IconButton
                                        icon={Pencil}
                                        label={t('profiles.editLabel', { name: profile.name })}
                                        onClick={() => setEditingId(profile.id)}
                                        data-testid={`profile-modal-edit-${profile.isKid ? 'kid' : profile.name.toLowerCase()}`}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex items-end space-x-2">
                    <Field label={t('profiles.newProfile')}>
                        <input
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            placeholder={t('profiles.namePlaceholder')}
                            data-focusable="true"
                            tabIndex={0}
                            className={inputClassName}
                        />
                    </Field>
                    <Button variant="primary" icon={Plus} onClick={handleCreate}>
                        {t('profiles.create')}
                    </Button>
                </div>

                {error && <p className="text-brand text-sm mt-4">{error}</p>}
            </Modal>

            {editingId && (
                <ProfileEditModal
                    profileId={editingId}
                    onClose={() => setEditingId(null)}
                />
            )}
        </>
    );
}
