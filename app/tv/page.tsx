'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import qrcode from 'qrcode-generator';
import { useAuth } from '@/app/context/AuthContext';
import Button from '@/components/ui/Button';

function qrDataUri(text: string): string {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface PairingState {
    code: string;
    pairingId: string;
    qr: string;
}

/**
 * TV-only screen (separate URL from the phone login).
 * Generates code + QR and polls until the phone attaches credentials.
 */
export default function TvPairPage() {
    const { login, loginWithM3U, isAuthenticated, isLoading } = useAuth();
    const [pairing, setPairing] = useState<PairingState | null>(null);
    const [pairStatus, setPairStatus] = useState<'boot' | 'waiting' | 'expired' | 'error'>('boot');
    const pollTimerRef = useRef<number | undefined>(undefined);

    const startPairing = useCallback(async () => {
        setPairStatus('boot');
        setPairing(null);
        try {
            const res = await fetch('/api/remote-login/start', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Falha ao iniciar pareamento');
            const pairUrl = `${window.location.origin}/pair?code=${encodeURIComponent(data.code)}`;
            const state: PairingState = {
                code: data.code,
                pairingId: data.pairingId,
                qr: qrDataUri(pairUrl),
            };
            setPairing(state);
            setPairStatus('waiting');

            const poll = async () => {
                try {
                    const r = await fetch('/api/remote-login/poll', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pairingId: state.pairingId }),
                    });
                    const p = await r.json();
                    if (p.status === 'ok') {
                        if (p.payload?.mode === 'xtream') {
                            await login(p.payload.hostUrl, p.payload.username, p.payload.password);
                        } else if (p.payload?.mode === 'm3u') {
                            await loginWithM3U(p.payload.m3uUrl);
                        } else {
                            setPairStatus('error');
                        }
                        return;
                    }
                    if (p.status === 'expired') {
                        setPairStatus('expired');
                        return;
                    }
                    pollTimerRef.current = window.setTimeout(poll, 2000);
                } catch {
                    pollTimerRef.current = window.setTimeout(poll, 3000);
                }
            };
            pollTimerRef.current = window.setTimeout(poll, 2000);
        } catch (e) {
            console.error('[TV] start pairing failed', e);
            setPairStatus('error');
        }
    }, [login, loginWithM3U]);

    useEffect(() => {
        if (isAuthenticated) return;
        void startPairing();
        return () => {
            if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
        };
    }, [isAuthenticated, startPairing]);

    if (isLoading && !pairing && pairStatus === 'boot') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg text-ink">
                <div className="w-16 h-16 border-4 border-ink border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg px-4">
                <div className="text-center">
                    <p className="text-2xl font-semibold text-ink">
                        <span className="text-brand">X</span>stream
                    </p>
                    <p className="text-ok mt-3">Conectado. Abrindo…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-8">
            <div className="w-full max-w-lg text-center">
                <h1 className="text-4xl font-semibold text-ink tracking-tight">
                    <span className="text-brand">X</span>stream
                </h1>
                <p className="text-ink-2 mt-2">Etapa 1 · Gere o código e pareie pelo celular</p>

                <div className="mt-8 bg-surface border border-line rounded-2xl p-8">
                    {pairStatus === 'boot' && (
                        <div className="py-10">
                            <div className="w-14 h-14 mx-auto border-4 border-ink border-t-transparent rounded-full animate-spin" />
                            <p className="text-ink-2 mt-4">Gerando código…</p>
                        </div>
                    )}

                    {(pairStatus === 'waiting' || pairStatus === 'expired') && pairing && (
                        <div>
                            <p className="text-ink-2 text-sm uppercase tracking-widest">Código de pareamento</p>
                            <p className="mt-3 text-6xl md:text-7xl font-mono font-bold tracking-[0.35em] text-ink tnum select-all">
                                {pairing.code}
                            </p>
                            <div className="mt-6 inline-block bg-white p-3 rounded-xl">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={pairing.qr} alt="QR code de pareamento" width={180} height={180} />
                            </div>
                            <ol className="mt-5 text-ink-2 leading-relaxed text-left list-decimal list-inside space-y-1">
                                <li>Abra o app no <strong className="text-ink">celular</strong> (ou escaneie o QR).</li>
                                <li>Em <strong className="text-ink">Pareamento</strong>, confirme o código (etapa 1).</li>
                                <li>Escolha <strong className="text-ink">DNS Xtream</strong> (usuário/senha) ou{' '}
                                    <strong className="text-ink">Link M3U</strong> completo.</li>
                                <li>Esta TV entra sozinha — sem digitar senha no controle.</li>
                            </ol>
                            {pairStatus === 'waiting' && (
                                <p className="mt-4 text-sm text-ok animate-pulse">Aguardando o celular… (código vale 5 min)</p>
                            )}
                            {pairStatus === 'expired' && (
                                <div className="mt-4">
                                    <p className="text-sm text-brand">Código expirado.</p>
                                    <Button variant="primary" className="mt-3" onClick={() => void startPairing()}>
                                        Gerar novo código
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {pairStatus === 'error' && (
                        <div className="py-6">
                            <p className="text-brand">Falha ao gerar código.</p>
                            <p className="text-ink-3 text-sm mt-1">Verifique o servidor e tente de novo.</p>
                            <Button variant="primary" className="mt-4" onClick={() => void startPairing()}>
                                Tentar de novo
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
