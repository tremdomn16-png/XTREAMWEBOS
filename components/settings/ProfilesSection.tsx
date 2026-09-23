'use client';

import { useState } from 'react';
import { useProfile } from '@/app/context/ProfileContext';
import { useAuth } from '@/app/context/AuthContext';
import { useT } from '@/app/context/I18nContext';
import { maxProfilesForPlan } from '@/components/ProfileSelector';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Field, { inputClassName } from '@/components/ui/Field';
import Badge from '@/components/ui/Badge';
import SectionHeader from '@/components/ui/SectionHeader';
import ProfileAvatar from '@/components/ProfileAvatar';
import ProfileEditModal from '@/components/ProfileEditModal';
import { Pencil, Plus } from 'lucide-react';

/**
 * Profile management list (Ajustes). Pencil opens ProfileEditModal —
 * image, rename, and delete live only there so Kid rules stay in one place.
 */
export default function ProfilesSection() {
    const { profiles, activeProfile, selectProfile, createProfile } = useProfile();
    const { user } = useAuth();
    const t = useT();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const canCreate = profiles.length < maxProfilesForPlan(user?.max_connections);

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
        <div data-testid="profiles-section">
            <SectionHeader title={t('profiles.title')} />
            <div className="space-y-2 mb-4">
                {profiles.map((profile) => {
                    const isActive = profile.id === activeProfile?.id;

                    return (
                        <div
                            key={profile.id}
                            className="flex items-center px-3 py-2.5 rounded-lg border border-line bg-surface"
                        >
                            <ProfileAvatar
                                avatar={profile.avatar}
                                isKid={profile.isKid}
                                name={profile.name}
                                sizeClassName="w-9 h-9"
                                className="mr-3"
                                alt={profile.name}
                            />

                            <button
                                onClick={() => selectProfile(profile.id)}
                                data-focusable="true"
                                data-profile-select={profile.id}
                                tabIndex={0}
                                className="flex-1 text-left text-sm text-ink truncate"
                            >
                                {profile.isKid ? t('profiles.kidName', { name: profile.name }) : profile.name}
                            </button>

                            {isActive && (
                                <span className="ml-2 flex-shrink-0">
                                    <Badge tone="ok">{t('profiles.active')}</Badge>
                                </span>
                            )}

                            <IconButton
                                icon={Pencil}
                                label={t('profiles.editLabel', { name: profile.name })}
                                size="sm"
                                onClick={() => setEditingId(profile.id)}
                                data-testid={`profiles-edit-${profile.isKid ? 'kid' : profile.name.toLowerCase()}`}
                                className="ml-2 flex-shrink-0"
                            />
                        </div>
                    );
                })}
            </div>

            {canCreate ? (
                <div className="flex items-end space-x-2">
                    <div className="flex-1">
                        <Field label={t('profiles.newProfile')} htmlFor="new-profile-name">
                            <input
                                id="new-profile-name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                placeholder={t('profiles.namePlaceholder')}
                                data-focusable="true"
                                data-testid="profile-new-input"
                                tabIndex={0}
                                className={inputClassName}
                            />
                        </Field>
                    </div>
                    <Button icon={Plus} onClick={handleCreate} data-testid="profile-add">
                        {t('profiles.create')}
                    </Button>
                </div>
            ) : (
                <p className="text-sm text-ink-3" data-testid="profile-limit">
                    {t('profiles.limitReached')}
                </p>
            )}

            {error && <p className="text-brand text-sm mt-3">{error}</p>}

            {editingId && (
                <ProfileEditModal
                    profileId={editingId}
                    onClose={() => setEditingId(null)}
                />
            )}
        </div>
    );
}
