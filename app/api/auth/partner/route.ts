import { NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { resolvePartner, isPartnerDnsUp } from '@/app/lib/partners';

export const runtime = 'nodejs';

/**
 * Partner login: short code (case-insensitive) → bound DNS → validate user/pass on IPTV.
 * Order: partner exists → DNS reachable → credentials authentic.
 */
export async function POST(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const body = await request.json();
        const partnerCode = typeof body?.partner === 'string' ? body.partner : '';
        const username = typeof body?.username === 'string' ? body.username.trim() : '';
        const password = typeof body?.password === 'string' ? body.password : '';

        if (!partnerCode.trim() || !username || !password) {
            return NextResponse.json(
                { error: 'Informe parceiro, usuário e senha' },
                { status: 400 }
            );
        }

        const resolved = resolvePartner(partnerCode);
        if (!resolved) {
            return NextResponse.json(
                { error: 'Parceiro inválido. Confira o código de parceiro.' },
                { status: 404 }
            );
        }

        const dnsUp = await isPartnerDnsUp(resolved.hostUrl);
        if (!dnsUp) {
            return NextResponse.json(
                { error: 'DNS do parceiro indisponível no momento. Tente novamente.' },
                { status: 502 }
            );
        }

        const apiUrl =
            `${resolved.hostUrl}/player_api.php?` +
            `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

        const upstream = await fetch(apiUrl, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'xstream-lite/1.0' },
        });

        if (!upstream.ok) {
            return NextResponse.json(
                { error: `Falha ao conectar no provedor: ${upstream.status}` },
                { status: upstream.status }
            );
        }

        const data = await upstream.json();

        if (!data?.user_info || data.user_info.auth === 0) {
            return NextResponse.json(
                { error: 'Usuário ou senha inválidos neste provedor' },
                { status: 401 }
            );
        }

        // Same shape the client login flow expects + resolved host for TV pairing.
        return NextResponse.json({
            user_info: data.user_info,
            server_info: data.server_info,
            partner: resolved.code,
            hostUrl: resolved.hostUrl,
            username,
            password,
        });
    } catch (error: unknown) {
        console.error('[PartnerLogin]', error);
        const message = error instanceof Error && error.name === 'TimeoutError'
            ? 'Tempo esgotado ao consultar o provedor'
            : 'Erro ao validar parceiro';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
