import { NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { extractXtreamFromM3UUrl, fetchAndParseM3U, parseM3UContent } from '@/app/lib/m3u';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const body = await request.json();
        const { m3uUrl, m3uText } = body as { m3uUrl?: string; m3uText?: string };

        if (!m3uUrl && !m3uText) {
            return NextResponse.json({ error: 'Informe m3uUrl ou m3uText' }, { status: 400 });
        }

        // If user pasted a full Xtream M3U link, we can shortcut to Xtream credentials
        if (m3uUrl) {
            const xtream = extractXtreamFromM3UUrl(m3uUrl);
            if (xtream) {
                // Validate via Xtream API instead of downloading huge M3U
                const baseUrl = xtream.hostUrl.replace(/\/$/, '');
                const apiUrl = `${baseUrl}/player_api.php?username=${encodeURIComponent(xtream.username)}&password=${encodeURIComponent(xtream.password)}`;
                try {
                    const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.user_info && data.user_info.auth !== 0) {
                            return NextResponse.json({
                                mode: 'xtream',
                                credentials: xtream,
                                user_info: data.user_info,
                                server_info: data.server_info,
                                message: 'Link M3U detectado como Xtream - use login Xtream direto (mais leve)'
                            });
                        }
                    }
                } catch {
                    // fall through to generic M3U fetch
                }
            }
            // Generic M3U fetch + parse
            const parsed = await fetchAndParseM3U(m3uUrl);
            return NextResponse.json({
                mode: 'm3u',
                m3uUrl,
                parsed,
                counts: { live: parsed.live.length, movies: parsed.movies.length, series: parsed.series.length, groups: parsed.groups.length }
            });
        }

        if (m3uText) {
            const parsed = parseM3UContent(m3uText);
            return NextResponse.json({
                mode: 'm3u',
                parsed,
                counts: { live: parsed.live.length, movies: parsed.movies.length, series: parsed.series.length, groups: parsed.groups.length }
            });
        }

        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error: unknown) {
        console.error('[M3U Parse] Error', error);
        const message = error instanceof Error ? error.message : 'Falha ao processar M3U';
        return NextResponse.json({ error: message || 'Falha ao processar M3U' }, { status: 500 });
    }
}
