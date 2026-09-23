'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { useT } from '@/app/context/I18nContext';
import { getDeviceFeatures } from '@/app/lib/device';
import Field, { inputClassName } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import type { RemoteLoginPayload } from '@/app/lib/remoteLoginStore';

type Step = 1 | 2 | 3;
/** After the TV code: only two ways to connect IPTV. */
type ConnectMethod = 'm3u' | 'xtream';

/**
 * Phone/web remote pairing — strictly staged (separate URL from /tv):
 *   Step 1: validate the code shown on the TV (mandatory first)
 *   Step 2: choose Link M3U completo OR DNS Xtream + usuário/senha
 *   Step 3: credentials pushed to the TV
 */
export default function PairPage() {
    const searchParams = useSearchParams();
    const { login, loginWithM3U } = useAuth();
    const t = useT();

    const [step, setStep] = useState<Step>(1);
    const [code, setCode] = useState('');
    const [method, setMethod] = useState<ConnectMethod>('xtream');
    const [hostUrl, setHostUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [m3uUrl, setM3uUrl] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [doneNote, setDoneNote] = useState('');

    useEffect(() => {
        // /pair is the phone/web side of pairing — a TV belongs on /tv.
        if (typeof window !== 'undefined' && getDeviceFeatures().preferTvLogin) {
            window.location.replace('/tv');
        }
    }, []);

    useEffect(() => {
        const fromUrl = (searchParams.get('code') || searchParams.get('pair') || '').toUpperCase().slice(0, 6);
        if (fromUrl.length === 6) setCode(fromUrl);
    }, [searchParams]);

    const confirmCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const normalized = code.trim().toUpperCase();
        if (normalized.length !== 6) {
            setError('O código tem 6 caracteres');
            return;
        }
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/remote-login/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: normalized }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                setError(data.error || 'Código inválido ou expirado');
                return;
            }
            setCode(normalized);
            setStep(2);
        } catch {
            setError('Falha ao validar o código. Tente de novo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const attachAndFinish = async (payload: RemoteLoginPayload): Promise<void> => {
        const res = await fetch('/api/remote-login/attach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, payload }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setDoneNote(`Login OK, mas a TV não recebeu (${data.error || res.status}). Você segue logado no celular.`);
        } else {
            setDoneNote(`Credenciais enviadas para a TV (código ${code}). A TV entra sozinha em instantes.`);
        }
        setStep(3);
    };

    const connect = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        try {
            if (method === 'm3u') {
                const url = m3uUrl.trim();
                if (!url) {
                    setError('Cole o link completo M3U');
                    setIsSubmitting(false);
                    return;
                }
                await loginWithM3U(url, { redirect: false });
                await attachAndFinish({ mode: 'm3u', m3uUrl: url });
                return;
            }

            if (!hostUrl.trim() || !username || !password) {
                setError('Informe DNS, usuário e senha');
                setIsSubmitting(false);
                return;
            }
            let resolvedHost = hostUrl.trim().replace(/\/$/, '');
            if (!/^https?:\/\//i.test(resolvedHost)) resolvedHost = `https://${resolvedHost}`;
            const creds = await login(resolvedHost, username, password, { redirect: false });
            await attachAndFinish({
                mode: 'xtream',
                hostUrl: creds.hostUrl,
                username: creds.username,
                password: creds.password,
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('login.failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const stepBadge = (n: Step, label: string) => (
        <div className={`flex items-center space-x-2 text-sm ${step >= n ? 'text-ink' : 'text-ink-3'}`}>
            <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                    step > n ? 'bg-ok text-bg' : step === n ? 'bg-ink text-bg' : 'bg-surface-3 text-ink-3'
                }`}
            >
                {step > n ? '✓' : n}
            </span>
            <span>{label}</span>
        </div>
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-8">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-semibold text-ink tracking-tight">
                        <span className="text-brand">X</span>stream
                    </h1>
                    <p className="text-ink-2 text-sm mt-2">Pareamento · sempre pelo código da TV</p>
                    <p className="text-ink-3 text-xs mt-1">
                        A TV fica em <span className="font-mono">/tv</span>. Aqui: código → conexão → envio.
                    </p>
                </div>

                <div className="bg-surface-2 border border-line rounded-xl p-4 mb-6 flex items-center justify-between">
                    {stepBadge(1, 'Código')}
                    <span className="text-ink-3">→</span>
                    {stepBadge(2, 'IPTV')}
                    <span className="text-ink-3">→</span>
                    {stepBadge(3, 'Enviar')}
                </div>

                {step === 1 && (
                    <form onSubmit={confirmCode} className="space-y-4 bg-surface border border-line rounded-xl p-5" autoComplete="off">
                        <div>
                            <p className="font-semibold text-ink">Etapa 1 · Código da TV (obrigatória)</p>
                            <p className="text-sm text-ink-2 mt-1">
                                Abra o app na TV (ou escaneie o QR). Digite as 6 letras que aparecem na tela.
                                Sem esse código não é possível parear.
                            </p>
                        </div>
                        <Field label="Código de pareamento" htmlFor="pair-code">
                            <input
                                id="pair-code"
                                type="text"
                                placeholder="ex: AB3K7M"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                                className={`${inputClassName} tracking-[0.3em] text-center font-mono uppercase text-lg h-14`}
                                required
                                maxLength={6}
                                data-focusable="true"
                                autoComplete="off"
                                autoFocus
                            />
                        </Field>
                        {error && <p className="text-brand text-sm">{error}</p>}
                        <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting}>
                            Confirmar código
                        </Button>
                        <p className="text-xs text-ink-3 text-center">
                            Sem TV ainda? Abra o app na TV em <span className="font-mono">/tv</span> para gerar o código.
                        </p>
                    </form>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <div className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-ink-2 uppercase tracking-widest">Código confirmado</p>
                                <p className="text-2xl font-mono font-bold tracking-[0.25em] text-ok">{code}</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => { setStep(1); setError(''); }}>
                                Trocar
                            </Button>
                        </div>

                        <div className="flex bg-surface-2 p-1 rounded-xl border border-line">
                            <button
                                type="button"
                                onClick={() => { setMethod('xtream'); setError(''); }}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${method === 'xtream' ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:text-ink'}`}
                                data-focusable="true"
                            >
                                DNS Xtream
                            </button>
                            <button
                                type="button"
                                onClick={() => { setMethod('m3u'); setError(''); }}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${method === 'm3u' ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:text-ink'}`}
                                data-focusable="true"
                            >
                                Link M3U
                            </button>
                        </div>

                        <form onSubmit={connect} className="space-y-4 bg-surface border border-line rounded-xl p-5" autoComplete="off">
                            <p className="font-semibold text-ink">Etapa 2 · Como conectar o IPTV</p>

                            {method === 'xtream' ? (
                                <>
                                    <p className="text-xs text-ink-3 -mt-2">DNS Xtream + usuário e senha do provedor.</p>
                                    <Field label="DNS Xtream" htmlFor="xtream-host" hint="Ex: https://seu.dns.space">
                                        <input
                                            id="xtream-host"
                                            type="url"
                                            placeholder="https://seu.dns.space"
                                            value={hostUrl}
                                            onChange={(e) => setHostUrl(e.target.value)}
                                            className={inputClassName}
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
                                </>
                            ) : (
                                <>
                                    <p className="text-xs text-ink-3 -mt-2">
                                        Link completo M3U / M3U Plus / get.php (já com credenciais).
                                    </p>
                                    <Field
                                        label="Link M3U completo"
                                        htmlFor="m3u-url"
                                        hint="Ex: http://dns:8080/get.php?username=…&password=…&type=m3u_plus"
                                    >
                                        <input
                                            id="m3u-url"
                                            type="url"
                                            placeholder="http://…/get.php?username=…&password=…"
                                            value={m3uUrl}
                                            onChange={(e) => setM3uUrl(e.target.value)}
                                            className={inputClassName}
                                            required
                                            data-focusable="true"
                                            autoComplete="off"
                                            autoCorrect="off"
                                            spellCheck={false}
                                        />
                                    </Field>
                                </>
                            )}

                            {error && <p className="text-brand text-sm">{error}</p>}
                            <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting}>
                                Conectar e enviar para a TV
                            </Button>
                        </form>
                    </div>
                )}

                {step === 3 && (
                    <div className="bg-surface border border-line rounded-xl p-6 text-center space-y-4">
                        <div className="w-14 h-14 mx-auto rounded-full bg-ok/15 border border-ok/40 flex items-center justify-center text-ok text-2xl">
                            ✓
                        </div>
                        <div>
                            <p className="font-semibold text-ink">Etapa 3 concluída</p>
                            <p className="text-sm text-ink-2 mt-1">{doneNote}</p>
                        </div>
                        <div className="space-y-2">
                            <Button variant="primary" size="lg" fullWidth onClick={() => { window.location.href = '/dashboard'; }}>
                                Ir para o painel
                            </Button>
                            <Button variant="ghost" fullWidth onClick={() => { setStep(1); setCode(''); setError(''); setDoneNote(''); }}>
                                Parear outra TV
                            </Button>
                        </div>
                    </div>
                )}

                <div className="mt-6 text-center">
                    <Link href="/" className="text-xs text-ink-3 hover:text-ink underline" data-focusable="true">
                        Só quero entrar no celular (sem parear TV)
                    </Link>
                </div>
            </div>
        </div>
    );
}
