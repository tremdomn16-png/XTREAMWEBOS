import { NextResponse } from 'next/server';
import { attachToCode, type RemoteLoginPayload } from '@/app/lib/remoteLoginStore';

export const runtime = 'nodejs';

function isValidPayload(body: unknown): body is RemoteLoginPayload {
    if (typeof body !== 'object' || body === null) return false;
    const b = body as Record<string, unknown>;
    if (b.mode === 'xtream') {
        return Boolean(b.hostUrl && b.username && b.password);
    }
    if (b.mode === 'm3u') {
        return Boolean(b.m3uUrl);
    }
    return false;
}

/** Phone sends its IPTV credentials to the code currently shown on the TV. */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const code = typeof body?.code === 'string' ? body.code : '';
        const payload = body?.payload;

        if (code.trim().length !== 6) {
            return NextResponse.json({ error: 'Código tem 6 caracteres' }, { status: 400 });
        }
        if (!isValidPayload(payload)) {
            return NextResponse.json({ error: 'Credenciais IPTV inválidas' }, { status: 400 });
        }

        const ok = attachToCode(code, payload);
        if (!ok) {
            return NextResponse.json({ error: 'Código inválido, já usado ou expirado (5 min)' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Falha ao anexar credenciais';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
