import { NextResponse } from 'next/server';
import { pollPairing } from '@/app/lib/remoteLoginStore';

export const runtime = 'nodejs';

/** TV polls with its pairingId. The poll that finds credentials attached gets them once. */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const pairingId = typeof body?.pairingId === 'string' ? body.pairingId.trim() : '';
        if (!pairingId) {
            return NextResponse.json({ error: 'pairingId obrigatório' }, { status: 400 });
        }
        return NextResponse.json(pollPairing(pairingId));
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Falha ao consultar código';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
