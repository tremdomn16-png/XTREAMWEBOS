import { NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import * as library from '@/app/lib/sqliteCache';
import type { ContentType } from '@/app/lib/dbTypes';
import { resolveProfileId, getProfile } from '@/app/lib/userStore';
import { filterKidCategories, filterKidStreams, isAdultLabel } from '@/app/lib/kidFilter';
import { shouldHideAdult } from '@/app/lib/adultLock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LibraryAction =
    | 'saveDetail'
    | 'getDetail'
    | 'saveCategories'
    | 'getCategories'
    | 'saveStreams'
    | 'getStreams'
    | 'searchStreams'
    | 'getStreamCount'
    | 'getStreamsByIds'
    | 'saveSyncMetadata'
    | 'getSyncMetadata'
    | 'clearCache'
    | 'saveTMDbCache'
    | 'getTMDbCache'
    | 'clearExpiredTMDbCache'
    | 'saveCarouselCache'
    | 'getCarouselCache'
    | 'clearExpiredCarouselCache';

interface LibraryRequestBody {
    action?: LibraryAction;
    id?: string | number;
    ids?: (string | number)[];
    type?: ContentType | string;
    categoryId?: string;
    categories?: Parameters<typeof library.saveCategories>[0];
    streams?: Parameters<typeof library.saveStreams>[0];
    meta?: Parameters<typeof library.saveSyncMetadata>[0];
    query?: string;
    limit?: number;
    key?: string;
    dateKey?: string;
    currentDateKey?: string;
    ttl?: number;
    data?: unknown;
}

const CONTENT_TYPES: ContentType[] = ['live', 'movie', 'series'];

function jsonData(data: unknown) {
    return NextResponse.json({ data: data ?? null });
}

function asContentType(value: unknown): ContentType | undefined {
    return CONTENT_TYPES.find(type => type === value);
}

/** Kid profile → catalog must be filtered on every read path. */
function isKidRequest(request: Request): boolean {
    const profileId = resolveProfileId(request);
    if (!profileId) return false;
    return getProfile(profileId)?.isKid === true;
}

/** category_id → name map so adult/kid filters can drop streams by category label. */
function buildCategoryNameMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const cat of library.getCategories()) {
        if (cat.category_id != null && cat.category_name) {
            map.set(String(cat.category_id), cat.category_name);
        }
    }
    return map;
}

interface CarouselRow {
    data?: { name?: string; title?: string }[];
}

function stripAdultCarouselRows(rows: CarouselRow[]): CarouselRow[] {
    return rows.map(row => {
        if (!Array.isArray(row.data)) return row;
        return {
            ...row,
            data: row.data.filter(item => !isAdultLabel(item?.name ?? item?.title)),
        };
    });
}

export async function POST(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const body = await request.json() as LibraryRequestBody;

        const kid = isKidRequest(request);
        // Kid always hides adult labels; other profiles hide them while the PIN lock is on.
        const hideAdult = kid || (await shouldHideAdult(request));
        const restricted = kid || hideAdult;
        const categoryNames = restricted ? buildCategoryNameMap() : undefined;

        const filterCategories = <T extends { category_id?: string | number; category_name?: string }>(cats: T[]) =>
            restricted ? filterKidCategories(cats) : cats;
        const filterStreams = <T extends { name?: string; genre?: string | null; category_id?: string | number | null }>(streams: T[]) =>
            restricted ? filterKidStreams(streams, categoryNames) : streams;

        // The detail cache is keyed per content type: a `series_id` and a `stream_id`
        // can be the same number and must not read back each other's payload.
        if (body.action === 'saveDetail' || body.action === 'getDetail') {
            const detailType = asContentType(body.type);
            if (!detailType) {
                return NextResponse.json({ error: 'Tipo de conteúdo inválido' }, { status: 400 });
            }

            if (body.action === 'getDetail') {
                const detail = library.getDetail(detailType, body.id ?? '');
                if (restricted && detail) {
                    const streamName = (detail as { name?: string; movie_name?: string; name_en?: string }).name
                        ?? (detail as { movie_name?: string }).movie_name;
                    if (streamName && isAdultLabel(streamName)) {
                        return jsonData(null);
                    }
                    // Also drop when the parent stream row is adult (category/genre).
                    const parent = library.getStreamsByIds([body.id ?? ''], detailType)[0];
                    if (parent && !filterStreams([parent]).length) {
                        return jsonData(null);
                    }
                }
                return jsonData(detail);
            }

            library.saveDetail(detailType, body.id ?? '', body.data);
            return NextResponse.json({ success: true });
        }

        switch (body.action) {
            case 'saveCategories':
                library.saveCategories(body.categories ?? []);
                return NextResponse.json({ success: true });
            case 'getCategories': {
                const cats = library.getCategories(body.type as ContentType | undefined);
                return jsonData(filterCategories(cats));
            }
            case 'saveStreams':
                library.saveStreams(body.streams ?? []);
                return NextResponse.json({ success: true });
            case 'getStreams': {
                const streams = library.getStreams(String(body.categoryId ?? ''), body.type as ContentType);
                return jsonData(filterStreams(streams));
            }
            case 'searchStreams': {
                const results = library.searchStreams(
                    String(body.query ?? ''),
                    body.type as ContentType | undefined,
                    body.limit,
                );
                return jsonData(filterStreams(results));
            }
            case 'getStreamCount': {
                if (!restricted) {
                    return jsonData(library.getStreamCount(body.type as ContentType | undefined));
                }
                const all = library.getAllStreams(body.type as ContentType | undefined);
                return jsonData(filterStreams(all).length);
            }
            case 'getStreamsByIds': {
                const items = library.getStreamsByIds(body.ids ?? [], asContentType(body.type));
                return jsonData(filterStreams(items));
            }
            case 'saveSyncMetadata':
                if (body.meta) library.saveSyncMetadata(body.meta);
                return NextResponse.json({ success: true });
            case 'getSyncMetadata':
                return jsonData(library.getSyncMetadata(String(body.type ?? '')));
            case 'clearCache':
                library.clearCache();
                return NextResponse.json({ success: true });
            case 'saveTMDbCache':
                library.saveTMDbCache(String(body.key ?? ''), body.data);
                return NextResponse.json({ success: true });
            case 'getTMDbCache':
                return jsonData(library.getTMDbCache(String(body.key ?? '')));
            case 'clearExpiredTMDbCache':
                library.clearExpiredTMDbCache(body.ttl ?? 1000 * 60 * 60 * 24);
                return NextResponse.json({ success: true });
            case 'saveCarouselCache':
                library.saveCarouselCache(String(body.dateKey ?? ''), Array.isArray(body.data) ? body.data : []);
                return NextResponse.json({ success: true });
            case 'getCarouselCache': {
                const cached = library.getCarouselCache(String(body.dateKey ?? ''));
                if (restricted && Array.isArray(cached)) {
                    return jsonData(stripAdultCarouselRows(cached as CarouselRow[]));
                }
                return jsonData(cached);
            }
            case 'clearExpiredCarouselCache':
                library.clearExpiredCarouselCache(String(body.currentDateKey ?? ''));
                return NextResponse.json({ success: true });
            default:
                return NextResponse.json({ error: 'Invalid library action' }, { status: 400 });
        }
    } catch (error) {
        console.error('[Library] Request failed:', error);
        return NextResponse.json({ error: 'Library request failed' }, { status: 500 });
    }
}
