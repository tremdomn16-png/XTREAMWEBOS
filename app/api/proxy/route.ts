import { NextResponse } from 'next/server';
import {
    responseCache,
    CACHE_TTL,
    getCacheKey,
    performPeriodicCleanup,
    fetchWithRetry,
    parseResponse
} from './cache';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { shouldHideAdult } from '@/app/lib/adultLock';
import { isAdultLabel } from '@/app/lib/kidFilter';
import * as library from '@/app/lib/sqliteCache';
import type { ContentType } from '@/app/lib/dbTypes';

/** Block adult VOD detail/info while the PIN lock is on (kid or locked session). */
async function refuseAdultVod(request: Request, action: string, id: string | undefined): Promise<NextResponse | null> {
    if (action !== 'get_vod_info' && action !== 'get_series_info') return null;
    if (!id) return null;
    if (!(await shouldHideAdult(request))) return null;

    const type: ContentType = action === 'get_vod_info' ? 'movie' : 'series';
    try {
        const stream = library.getStreamsByIds([id], type)[0];
        if (stream && (isAdultLabel(stream.name) || isAdultLabel(stream.genre ?? undefined))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
    } catch {
        // Cache miss on stream row — allow; labels elsewhere still filter lists.
    }
    return null;
}

export async function POST(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const body = await request.json();
        const { hostUrl, username, password, action, page, limit, ...otherParams } = body;

        if (!hostUrl || !username || !password) {
            return NextResponse.json(
                { error: 'Missing credentials' },
                { status: 400 }
            );
        }

        const adultGate = await refuseAdultVod(
            request,
            String(action ?? ''),
            otherParams.vod_id != null ? String(otherParams.vod_id)
                : otherParams.series_id != null ? String(otherParams.series_id)
                : undefined
        );
        if (adultGate) return adultGate;

        // Periodic cache cleanup (every 2 minutes)
        performPeriodicCleanup();

        const baseUrl = hostUrl.replace(/\/$/, '');

        // ---- PAGINATED MODE ----
        // When page & limit are provided, serve from server-side cache
        if (page !== undefined && limit !== undefined) {
            const cacheKey = getCacheKey(hostUrl, username, action);
            let cached = responseCache.get(cacheKey);

            // If no cache or expired, fetch from upstream first
            if (!cached || Date.now() - cached.timestamp > CACHE_TTL) {
                console.log(`[Proxy] Paginated: Fetching full data for ${action} (cache miss)`);

                const params = new URLSearchParams({
                    username,
                    password,
                    action: action || '',
                    ...otherParams
                });
                const apiUrl = `${baseUrl}/player_api.php?${params.toString()}`;

                const response = await fetchWithRetry(apiUrl, action);
                if (!response.ok) {
                    return NextResponse.json(
                        { error: `Upstream error: ${response.statusText}` },
                        { status: response.status }
                    );
                }

                const data = await parseResponse(response);

                if (Array.isArray(data)) {
                    cached = { data, timestamp: Date.now(), total: data.length };
                    responseCache.set(cacheKey, cached);
                    console.log(`[Proxy] Paginated: Cached ${data.length} items for ${action}`);
                } else {
                    // Non-array response, return directly
                    return NextResponse.json(data);
                }
            }

            // Serve the requested page
            const pageNum = Math.max(1, parseInt(page));
            const pageSize = Math.min(5000, Math.max(1, parseInt(limit)));
            const startIdx = (pageNum - 1) * pageSize;
            const endIdx = Math.min(startIdx + pageSize, cached.total);
            const pageData = cached.data.slice(startIdx, endIdx);

            const totalPages = Math.ceil(cached.total / pageSize);

            console.log(`[Proxy] Paginated: ${action} page ${pageNum}/${totalPages} (${pageData.length} items, total: ${cached.total})`);

            return NextResponse.json({
                items: pageData,
                page: pageNum,
                limit: pageSize,
                total: cached.total,
                totalPages,
                hasMore: pageNum < totalPages
            });
        }

        // ---- STANDARD MODE (non-paginated, for categories and small requests) ----
        const params = new URLSearchParams({
            username,
            password,
            action: action || '',
            ...otherParams
        });

        const apiUrl = `${baseUrl}/player_api.php?${params.toString()}`;

        console.log(`[Proxy] Action: ${action} | URL: ${apiUrl}`);
        if (Object.keys(otherParams).length > 0) {
            console.log(`[Proxy] Params:`, JSON.stringify(otherParams));
        }

        const response = await fetchWithRetry(apiUrl, action);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Upstream error: ${response.statusText}`, details: response.status === 504 ? 'Gateway Timeout' : undefined },
                { status: response.status }
            );
        }

        const data = await parseResponse(response);
        const count = Array.isArray(data) ? data.length : 'object';
        console.log(`[Proxy] Data: ${count} items/type`);

        return NextResponse.json(data);

    } catch (error) {
        console.error('[Proxy] CRITICAL Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error instanceof Error ? error.message : undefined },
            { status: 500 }
        );
    }
}

