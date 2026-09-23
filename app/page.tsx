'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from './context/AuthContext';
import { useT } from './context/I18nContext';
import { useRouter } from 'next/navigation';
import { getDeviceFeatures } from '@/app/lib/device';
import Field, { inputClassName } from '@/components/ui/Field';
import Button from '@/components/ui/Button';

type Method = 'partner' | 'pair';

/**
 * Phone/web login — exactly 2 methods:
 *  1) Login Parceiro (normal sign-in)
 *  2) Pareamento rápido → always goes through the TV code first (/pair)
 * TV screen lives on /tv.
 */
export default function LoginPage() {
    const { loginPartner, isAuthenticated, isLoading } = useAuth();
    const t = useT();
    const router = useRouter();

    const [method, setMethod] = useState<Method>('partner');
    const [partnerCode, setPartnerCode] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            router.push('/dashboard');
            return;
        }
        // TV never shows partner login / pair tabs — it opens the code screen.
        if (!isLoading && typeof window !== 'undefined' && getDeviceFeatures().preferTvLogin) {
            router.replace('/tv');
        }
    }, [isAuthenticated, isLoading, router]);

    const handlePartnerSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        if (!partnerCode.trim() || !username || !password) {
            setError(t('login.fillAllFields'));
            setIsSubmitting(false);
            return;
        }
        try {
            await loginPartner(partnerCode.trim(), username, password);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('login.failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading && !isSubmitting) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg text-ink">
                <div className="w-16 h-16 border-4 border-ink border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-8">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-semibold text-ink tracking-tight">
                        <span className="text-brand">X</span>stream
                    </h1>
                    <p className="text-ink-2 text-sm mt-2">{t('login.tagline')}</p>
                    <p className="text-ink-3 text-xs mt-1">Servidor leve • Conecta direto no seu provedor</p>
                </div>

                <div className="flex mb-6 bg-surface-2 p-1 rounded-xl border border-line">
                    <button
                        onClick={() => { setMethod('partner'); setError(''); }}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${method === 'partner' ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:text-ink'}`}
                        data-focusable="true"
                    >
                        Login Parceiro
                    </button>
                    <button
                        onClick={() => { setMethod('pair'); setError(''); }}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${method === 'pair' ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:text-ink'}`}
                        data-focusable="true"
                    >
                        Pareamento rápido
                    </button>
                </div>

                {method === 'partner' ? (
                    <form onSubmit={handlePartnerSubmit} className="space-y-4" autoComplete="off">
                        <Field
                            label="Código do parceiro"
                            htmlFor="partner-code"
                            hint="Código curto do seu parceiro (ex: nexxo). O DNS fica vinculado — você não digita servidor."
                        >
                            <input
                                id="partner-code"
                                type="text"
                                placeholder="nexxo"
                                value={partnerCode}
                                onChange={(e) => setPartnerCode(e.target.value)}
                                className={`${inputClassName} font-mono lowercase`}
                                required
                                data-focusable="true"
                                autoComplete="off"
                                autoCorrect="off"
                                spellCheck={false}
                            />
                        </Field>
                        <Field label={t('login.username')} htmlFor="username">
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className={inputClassName}
                                required
                                data-focusable="true"
                                autoComplete="off"
                                autoCorrect="off"
                                spellCheck={false}
                            />
                        </Field>
                        <Field label={t('login.password')} htmlFor="password">
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={inputClassName}
                                required
                                data-focusable="true"
                                autoComplete="new-password"
                            />
                        </Field>
                        {error && <p className="text-brand text-sm">{error}</p>}
                        <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting}>
                            {t('login.signIn')}
                        </Button>
                    </form>
                ) : (
                    <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
                        <div>
                            <p className="font-semibold text-ink">Parear com a TV · por etapas</p>
                            <p className="text-sm text-ink-2 mt-1 leading-relaxed">
                                Pareamento <strong>sempre</strong> começa pelo código da TV.
                                Só depois você escolhe como conectar o IPTV.
                            </p>
                        </div>

                        <ol className="space-y-2 text-sm text-ink-2 list-decimal list-inside">
                            <li>
                                Abra o app na <strong className="text-ink">TV</strong>{' '}
                                (<span className="font-mono text-ink-3">/tv</span>) — ela gera o código de 6 letras + QR.
                            </li>
                            <li>
                                Confirme o código aqui em <strong className="text-ink">/pair</strong>.
                            </li>
                            <li>
                                Escolha <strong className="text-ink">link M3U completo</strong> ou{' '}
                                <strong className="text-ink">DNS Xtream + usuário/senha</strong>.
                            </li>
                            <li>A TV recebe as credenciais e entra sozinha.</li>
                        </ol>

                        <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/pair')}>
                            Digitar código da TV
                        </Button>

                        <div className="flex justify-between text-xs">
                            <Link href="/tv" className="text-ink-3 hover:text-ink underline" data-focusable="true">
                                Pré-visualizar tela da TV
                            </Link>
                            <Link href="/pair" className="text-brand hover:underline" data-focusable="true">
                                Abrir /pair →
                            </Link>
                        </div>
                    </div>
                )}

                <div className="mt-6 text-center border-t border-line pt-4">
                    <p className="text-xs text-ink-3 font-mono">{t('login.compat')}</p>
                </div>
            </div>
        </div>
    );
}
