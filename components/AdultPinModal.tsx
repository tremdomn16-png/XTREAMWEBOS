'use client';

import { FormEvent, useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/app/lib/apiClient';
import { useT } from '@/app/context/I18nContext';
import Modal from '@/components/ui/Modal';
import Field, { inputClassName } from '@/components/ui/Field';
import Button from '@/components/ui/Button';

export interface AdultPinModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called after a successful unlock so the parent can refresh blocked content. */
    onUnlocked?: () => void;
}

/** 4-digit PIN prompt for adult content (TV: password field is D-pad friendly). */
export default function AdultPinModal({ isOpen, onClose, onUnlocked }: AdultPinModalProps) {
    const t = useT();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');

        if (!/^\d{4}$/.test(pin)) {
            setError(t('settings.parental.pinRule'));
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await apiFetch('/api/adult-lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'verify', pin }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || t('serverErrors.adultPinInvalid'));
            }
            setPin('');
            onClose();
            onUnlocked?.();
        } catch (submitError: unknown) {
            setError(submitError instanceof Error ? submitError.message : t('serverErrors.adultPinInvalid'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                setPin('');
                setError('');
                onClose();
            }}
            title={t('settings.parental.unlockTitle')}
            description={t('settings.parental.unlockDesc')}
            size="sm"
        >
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="adult-pin-form">
                {error && (
                    <div className="flex items-center space-x-2 text-sm text-brand" data-testid="adult-pin-error">
                        <AlertCircle size={16} className="flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
                <Field label={t('settings.parental.currentPin')} htmlFor="adult-pin">
                    <input
                        id="adult-pin"
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={4}
                        value={pin}
                        onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                        className={`${inputClassName} tnum text-center tracking-[0.4em]`}
                        placeholder="••••"
                        required
                        autoFocus
                        data-focusable="true"
                        data-testid="adult-pin-input"
                    />
                </Field>
                <Button type="submit" variant="primary" fullWidth loading={isSubmitting} icon={Lock}>
                    {t('settings.parental.unlockSubmit')}
                </Button>
            </form>
        </Modal>
    );
}
