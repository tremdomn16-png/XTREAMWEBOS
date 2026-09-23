import { NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';

export async function POST(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const body = await request.json();
        const { username, password, hostUrl } = body;

        if (!username || !password || !hostUrl) {
            return NextResponse.json(
                { error: 'Missing credentials or host URL' },
                { status: 400 }
            );
        }

        // Normalized URL: remove trailing slash
        const baseUrl = hostUrl.replace(/\/$/, '');
        const apiUrl = `${baseUrl}/player_api.php?username=${username}&password=${password}`;

        console.log(`Attempting login to: ${baseUrl} for user: ${username}`);

        const response = await fetch(apiUrl);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to connect to server: ${response.statusText}` },
                { status: response.status }
            );
        }

        const data = await response.json();

        if (data.user_info && data.user_info.auth === 0) {
            return NextResponse.json(
                { error: 'Authentication failed' },
                { status: 401 }
            );
        }

        // Public mode: stateless - do NOT overwrite global data/config.json.
        // Keep optional legacy persist only if explicitly enabled via env (for single-tenant LAN).
        if (process.env.PERSIST_GLOBAL_CONFIG === 'true') {
            try {
                const fsp = await import('fs/promises');
                const pathModule = await import('path');
                const CONFIG_PATH = pathModule.join(process.cwd(), 'data', 'config.json');
                const authData = {
                    credentials: { hostUrl, username, password },
                    user: data.user_info,
                    server: data.server_info
                };
                await fsp.writeFile(CONFIG_PATH, JSON.stringify(authData, null, 2));
            } catch (e) {
                console.error('Failed to persist config on server', e);
            }
        }

        return NextResponse.json(data);

    } catch (error: unknown) {
        console.error('Proxy Error:', error);
        const details = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Internal Server Error', details },
            { status: 500 }
        );
    }
}
