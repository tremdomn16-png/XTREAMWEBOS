import 'server-only';

export interface M3UItem {
    name: string;
    url: string;
    logo?: string;
    group?: string;
    tvgId?: string;
    tvgName?: string;
}

export interface ParsedM3U {
    live: M3UItem[];
    movies: M3UItem[];
    series: M3UItem[];
    groups: string[];
}

function detectType(url: string, group: string): 'live' | 'movie' | 'series' {
    const lowerUrl = url.toLowerCase();
    const lowerGroup = (group || '').toLowerCase();
    if (lowerGroup.includes('serie') || lowerGroup.includes('série') || lowerGroup.includes('series')) return 'series';
    if (lowerGroup.includes('filme') || lowerGroup.includes('movie') || lowerGroup.includes('vod')) return 'movie';
    if (lowerUrl.includes('/series/')) return 'series';
    if (lowerUrl.includes('/movie/')) return 'movie';
    const ext = lowerUrl.split('?')[0].split('.').pop() || '';
    if (['mp4','mkv','avi'].includes(ext)) return 'movie';
    return 'live';
}

export function parseM3UContent(content: string): ParsedM3U {
    const lines = content.split(/\r?\n/);
    const result: ParsedM3U = { live: [], movies: [], series: [], groups: [] };
    const groupSet = new Set<string>();
    let pending: Partial<M3UItem> | null = null;

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#EXTINF')) {
            const nameMatch = line.match(/,(.*)$/);
            const name = nameMatch ? nameMatch[1].trim() : 'Sem nome';
            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            const groupMatch = line.match(/group-title="([^"]*)"/);
            const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
            const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
            pending = {
                name,
                logo: logoMatch?.[1] || undefined,
                group: groupMatch?.[1] || 'Sem categoria',
                tvgId: tvgIdMatch?.[1] || undefined,
                tvgName: tvgNameMatch?.[1] || undefined,
            };
        } else if (pending && (line.startsWith('http://') || line.startsWith('https://'))) {
            const item: M3UItem = {
                name: pending.name || 'Sem nome',
                url: line,
                logo: pending.logo,
                group: pending.group,
                tvgId: pending.tvgId,
                tvgName: pending.tvgName,
            };
            if (item.group) groupSet.add(item.group);
            const type = detectType(item.url, item.group || '');
            if (type === 'live') result.live.push(item);
            else if (type === 'movie') result.movies.push(item);
            else result.series.push(item);
            pending = null;
        }
    }
    result.groups = Array.from(groupSet);
    return result;
}

export interface XtreamFromM3U {
    hostUrl: string;
    username: string;
    password: string;
}

export function extractXtreamFromM3UUrl(m3uUrl: string): XtreamFromM3U | null {
    try {
        const u = new URL(m3uUrl);
        const username = u.searchParams.get('username');
        const password = u.searchParams.get('password');
        if (!username || !password) return null;
        const hostUrl = `${u.protocol}//${u.host}`;
        return { hostUrl, username, password };
    } catch {
        return null;
    }
}

export async function fetchAndParseM3U(m3uUrl: string, timeoutMs = 15000): Promise<ParsedM3U> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(m3uUrl, { signal: controller.signal, headers: { 'User-Agent': 'xstream-lite/1.0' } });
        if (!res.ok) throw new Error(`Falha ao buscar M3U: ${res.status} ${res.statusText}`);
        const text = await res.text();
        if (!text.includes('#EXTM3U') && !text.includes('#EXTINF')) {
            throw new Error('Conteúdo não parece ser M3U válido');
        }
        return parseM3UContent(text);
    } finally {
        clearTimeout(t);
    }
}
