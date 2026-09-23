import { NextRequest, NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { getBackendHeroItems } from '@/app/lib/catalogServer';
import { shouldHideAdult } from '@/app/lib/adultLock';
import { isAdultLabel } from '@/app/lib/kidFilter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HeroItem {
    title?: string;
    name?: string;
}

export async function GET(request: NextRequest) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const { searchParams } = new URL(request.url);
        const type = (searchParams.get('type') || 'all') as 'all' | 'movie' | 'series';

        if (type !== 'all' && type !== 'movie' && type !== 'series') {
            return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
        }

        let heroItems = await getBackendHeroItems(type);

        if (await shouldHideAdult(request)) {
            heroItems = heroItems.filter((item: HeroItem) => !isAdultLabel(item?.title ?? item?.name));
        }

        return NextResponse.json({ data: heroItems });
    } catch (error) {
        console.error('[API Hero] Request failed:', error);
        return NextResponse.json({ error: 'Failed to fetch hero highlights' }, { status: 500 });
    }
}
