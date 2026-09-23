'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useT } from '@/app/context/I18nContext';
import { apiFetch } from '@/app/lib/apiClient';
import Button from '@/components/ui/Button';
import Field, { inputClassName } from '@/components/ui/Field';
import Badge from '@/components/ui/Badge';
import SectionHeader from '@/components/ui/SectionHeader';

interface AdultLockState {
    locked: boolean;
    kid: boolean;
}

/** Parental controls: adult content stays hidden until the 4-digit PIN is entered. */
export default function ParentalSection() {
    const t = useT();
    const [state, setState] = useState<AdultLockState | null>(null);
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isBusy, setIsBusy] = useState(false);

    const loadStatus = useCallback(async () => {
        try {
            const response = await apiFetch('/api/adult-lock');
            if (response.ok) {
                setState(await response.json());
            }
        } catch {
            // Status is non-critical; leave unknown.
        }
    }, []);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const postAction = async (body: Record<string, unknown>) => {
        setIsBusy(true);
        setError('');
        setNotice('');
        try {
            const response = await apiFetch('/api/adult-lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || t('serverErrors.adultPinInvalid'));
            }
            await loadStatus();
            return data;
        } finally {
            setIsBusy(false);
        }
    };

    const handleUnlock = async () => {
        try {
            await postAction({ action: 'verify', pin: currentPin });
            setCurrentPin('');
        } catch (err) {
            setError(err instanceof Error ? err.message : t('serverErrors.adultPinInvalid'));
        }
    };

    const handleLock = async () => {
        try {
            await postAction({ action: 'lock' });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('serverErrors.adultPinInvalid'));
        }
    };

    const handleChangePin = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        setNotice('');

        if (!/^\d{4}$/.test(newPin)) {
            setError(t('settings.parental.pinRule'));
            return;
        }
        if (newPin !== confirmPin) {
            setError(t('settings.parental.pinMismatch'));
            return;
        }

        try {
            await postAction({ action: 'change', currentPin, newPin });
            setCurrentPin('');
            setNewPin('');
            setConfirmPin('');
            setNotice(t('settings.parental.changeSuccess'));
        } catch (err) {
            setError(err instanceof Error ? err.message : t('serverErrors.adultPinInvalid'));
        }
    };

    const locked = state?.locked !== false;

    return (
        <div data-testid="parental-section">
            <SectionHeader
                title={t('settings.parental.title')}
                description={t('settings.parental.description')}
                action={
                    state ? (
                        <Badge tone={locked ? 'warn' : 'ok'}>
                            {locked ? t('settings.parental.statusLocked') : t('settings.parental.statusUnlocked')}
                        </Badge>
                    ) : undefined
                }
            />

            <p className="text-xs text-ink-3 mb-4">{t('settings.parental.defaultPinHint')}</p>

            {error && <p className="text-sm text-brand mb-3" data-testid="parental-error">{error}</p>}
            {notice && <p className="text-sm text-ok mb-3" data-testid="parental-notice">{notice}</p>}

            <div className="flex flex-wrap items-end space-x-3 mb-6">
                <Field label={t('settings.parental.currentPin')} htmlFor="parental-unlock-pin">
                    <input
                        id="parental-unlock-pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={currentPin}
                        onChange={e => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        disabled={isBusy || state?.kid}
                        className={`${inputClassName} tnum tracking-[0.3em] w-32`}
                        data-focusable={isBusy || state?.kid ? undefined : 'true'}
                        tabIndex={isBusy || state?.kid ? undefined : 0}
                        data-testid="parental-unlock-input"
                    />
                </Field>
                <Button
                    onClick={handleUnlock}
                    loading={isBusy}
                    disabled={isBusy || currentPin.length !== 4 || state?.kid}
                    data-testid="parental-unlock"
                >
                    {t('settings.parental.unlock')}
                </Button>
                <Button
                    variant="ghost"
                    onClick={handleLock}
                    loading={isBusy}
                    disabled={isBusy || state?.kid}
                    data-testid="parental-lock"
                >
                    {t('settings.parental.lockNow')}
                </Button>
            </div>

            <form onSubmit={handleChangePin} className="space-y-3 max-w-sm" data-testid="parental-change-form">
                <Field label={t('settings.parental.newPin')} htmlFor="parental-new-pin">
                    <input
                        id="parental-new-pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        disabled={isBusy}
                        className={`${inputClassName} tnum tracking-[0.3em]`}
                        data-focusable={isBusy ? undefined : 'true'}
                        tabIndex={isBusy ? undefined : 0}
                        data-testid="parental-new-pin"
                    />
                </Field>
                <Field label={t('settings.parental.confirmPin')} htmlFor="parental-confirm-pin">
                    <input
                        id="parental-confirm-pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={confirmPin}
                        onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        disabled={isBusy}
                        className={`${inputClassName} tnum tracking-[0.3em]`}
                        data-focusable={isBusy ? undefined : 'true'}
                        tabIndex={isBusy ? undefined : 0}
                        data-testid="parental-confirm-pin"
                    />
                </Field>
                <Button
                    type="submit"
                    loading={isBusy}
                    disabled={isBusy || !currentPin || newPin.length !== 4}
                    data-testid="parental-change-submit"
                >
                    {t('settings.parental.changePin')}
                </Button>
            </form>
        </div>
    );
}
