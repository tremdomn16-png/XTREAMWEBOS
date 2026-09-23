import { NextResponse } from 'next/server';
import { startPairing } from '@/app/lib/remoteLoginStore';

export const runtime = 'nodejs';

/** TV opens this unauthenticated: gets a fresh 6-char code to display + poll with. */
export async function POST() {
    try {
        return NextResponse.json(startPairing());
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Falha ao iniciar pareamento';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
