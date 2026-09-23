import { NextResponse } from 'next/server';
import { checkCode } from '@/app/lib/remoteLoginStore';

export const runtime = 'nodejs';

/** Phone step 1: validate the 6-char code shown on the TV before asking for credentials. */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const code = typeof body?.code === 'string' ? body.code : '';
        const result = checkCode(code);
        if (!result.ok) {
            return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
        }
        return NextResponse.json({ ok: true, code: code.trim().toUpperCase() });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Erro ao validar código';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
