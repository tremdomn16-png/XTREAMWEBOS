import { NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { getBackendCarousels, CatalogCarouselRow } from '@/app/lib/catalogServer';
import { shouldHideAdult } from '@/app/lib/adultLock';
import { isAdultLabel } from '@/app/lib/kidFilter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const { searchParams } = new URL(request.url);
        const typeParam = searchParams.get('type');
        const type = typeParam === 'movie' || typeParam === 'series' ? typeParam : null;

        let carousels = await getBackendCarousels(type ?? undefined);

        // Never recommend adult titles while the lock is on (kid always, others until PIN).
        if (await shouldHideAdult(request)) {
            carousels = carousels.map((row: CatalogCarouselRow) => ({
                ...row,
                data: Array.isArray(row.data)
                    ? row.data.filter(item => !isAdultLabel(item?.name))
                    : row.data,
            }));
            carousels = carousels.filter((row: CatalogCarouselRow) => !row.data || row.data.length > 0);
        }

        return NextResponse.json({ data: carousels });
    } catch (error) {
        console.error('[API Carousels] Request failed:', error);
        return NextResponse.json({ error: 'Failed to fetch catalog carousels' }, { status: 500 });
    }
}
