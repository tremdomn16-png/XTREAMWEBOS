import 'server-only';
import fs from 'fs';
import path from 'path';

/**
 * Partner registry: short codes (case-insensitive) bound to a provider DNS.
 * Built-ins ship in code; extras live in data/partners.json (gitignored).
 */
const DATA_DIR = path.join(process.cwd(), 'data');
const PARTNERS_PATH = path.join(DATA_DIR, 'partners.json');

const BUILTIN: Record<string, string> = {
    nexxo: 'https://nexxo.spanel.space',
};

export interface PartnerResolution {
    code: string;
    hostUrl: string;
}

/** Returns the DNS bound to a partner code, or null when unknown. */
export function resolvePartner(rawCode: string): PartnerResolution | null {
    const code = (rawCode || '').trim().toLowerCase();
    if (!code) return null;

    const builtin = BUILTIN[code];
    if (builtin) return { code, hostUrl: builtin.replace(/\/$/, '') };

    try {
        const registry = JSON.parse(fs.readFileSync(PARTNERS_PATH, 'utf-8')) as Record<string, string>;
        const host = registry[code];
        if (host && /^https?:\/\//i.test(host)) {
            return { code, hostUrl: host.replace(/\/$/, '') };
        }
    } catch {
        // no extra registry — builtins only
    }
    return null;
}

/** Live check: can we reach the partner DNS player_api at all (no credentials). */
export async function isPartnerDnsUp(hostUrl: string, timeoutMs = 6000): Promise<boolean> {
    try {
        const url = `${hostUrl}/player_api.php`;
        const res = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'User-Agent': 'xstream-lite/1.0' },
        });
        // Xtream answers 200 with JSON (even empty auth) — any HTTP response means DNS is up.
        return res.status < 500;
    } catch {
        return false;
    }
}
