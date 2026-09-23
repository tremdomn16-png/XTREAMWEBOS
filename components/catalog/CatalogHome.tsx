'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { CachedCategory, ContentType } from '@/app/lib/dbTypes';
import { sortCategories } from '@/app/lib/catalogSort';
import { cleanDisplayTitle } from '@/app/lib/displayTitle';
import { useData } from '@/app/context/DataContext';
import { useWatchProgress } from '@/app/context/WatchProgressContext';
import { useFavorites } from '@/app/context/FavoritesContext';
import { useTMDb } from '@/app/context/TMDbContext';
import { useT } from '@/app/context/I18nContext';
import { apiFetch } from '@/app/lib/apiClient';
import HeroSection from '@/components/HeroSection';
import Row from '@/components/ui/Row';
import Poster from '@/components/ui/Poster';
import { SkeletonRow } from '@/components/ui/Skeleton';
import SectionHeader from '@/components/ui/SectionHeader';
import CardGrid from '@/components/CardGrid';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';

interface CarouselItemData {
    id: string | number;
    name: string;
    image: string;
    rating?: number | string;
    year?: number;
    type: 'movie' | 'series';
}

interface CarouselData {
    id: string;
    title: string;
    type: 'movie' | 'series';
    data: CarouselItemData[];
    categoryId?: string | number;
}

export interface CatalogHomeProps {
    type: Exclude<ContentType, 'live'>;
    /** Optional page title (movies/series i18n label); unused by hero layout today. */
    title?: string;
}

const ROW_BATCH = 3;
const SKELETON_COUNT = 12;
const ROUTE_SEGMENT: Record<string, string> = { movie: 'movies', series: 'series' };

/**
 * Netflix-style browse home for Movies/Series: hero + continue/list rows +
 * category carousels with local chips, then the full category grid.
 * One carousels request (`?type=`); chips filter rows already in memory.
 */
export default function CatalogHome({ type }: CatalogHomeProps) {
    const t = useT();
    const router = useRouter();
    const { lastSync, getCachedCategories } = useData();
    const { progressMap } = useWatchProgress();
    const { favorites, isLoaded: favoritesLoaded } = useFavorites();
    const { isConfigured } = useTMDb();

    const [carouselData, setCarouselData] = useState<CarouselData[]>([]);
    const [isLoadingCarousels, setIsLoadingCarousels] = useState(true);
    const [activeChip, setActiveChip] = useState('all');
    const [visibleCount, setVisibleCount] = useState(ROW_BATCH);
    const [categories, setCategories] = useState<CachedCategory[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoadingCarousels(true);
            try {
                const response = await apiFetch(`/api/catalog/carousels?type=${type}`);
                if (!response.ok) throw new Error('Failed to fetch carousels');
                const result = await response.json();
                if (!cancelled) setCarouselData(result.data || []);
            } catch (error) {
                console.error('Failed to load carousels:', error);
                if (!cancelled) setCarouselData([]);
            } finally {
                if (!cancelled) setIsLoadingCarousels(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [type, isConfigured, lastSync]);

    useEffect(() => {
        let cancelled = false;
        setCategoriesLoading(true);
        getCachedCategories(type)
            .then(cached => {
                if (!cancelled) setCategories(cached);
            })
            .catch(() => {
                if (!cancelled) setCategories([]);
            })
            .finally(() => {
                if (!cancelled) setCategoriesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [getCachedCategories, type]);

    // Reset chip + reveal window when the row set changes.
    useEffect(() => {
        setVisibleCount(ROW_BATCH);
        setActiveChip('all');
    }, [carouselData]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(prev => Math.min(prev + ROW_BATCH, carouselData.length));
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [carouselData.length, visibleCount]);

    const chips = useMemo(() => {
        const list: { id: string; label: string }[] = [{ id: 'all', label: t('catalog.all') }];
        const seen = new Set(['all']);
        for (const row of carouselData) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            list.push({ id: row.id, label: row.title });
        }
        return list;
    }, [carouselData, t]);

    const filteredRows = useMemo(() => {
        if (activeChip === 'all') return carouselData;
        return carouselData.filter(row => row.id === activeChip);
    }, [carouselData, activeChip]);

    const visibleRows = filteredRows.slice(0, visibleCount);
    const hasMore = visibleCount < filteredRows.length;

    const continueWatching = useMemo(() => {
        return Object.values(progressMap)
            .filter(item => (type === 'movie' ? item.type === 'movie' : item.type === 'series'))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 10)
            .map(item => ({
                id: item.streamId,
                name: item.name,
                image: item.image,
                progress: item.progress,
                duration: item.duration,
                href: item.type === 'movie'
                    ? `/dashboard/watch/movie/${item.streamId}?autoplay=true`
                    : `/dashboard/watch/series/${item.seriesId || item.streamId}?autoplay=true&episode=${item.episodeId || ''}`
            }));
    }, [progressMap, type]);

    const myList = useMemo(() => {
        return favorites
            .filter(item => item.type === type)
            .slice(0, 10)
            .map(item => ({
                id: item.id,
                name: item.name,
                image: item.image,
                href: item.type === 'movie'
                    ? `/dashboard/watch/movie/${item.id}`
                    : `/dashboard/watch/series/${item.id}`
            }));
    }, [favorites, type]);

    const sortedCategories = useMemo(
        () => sortCategories(categories, 'name-asc'),
        [categories]
    );
    const routeSegment = ROUTE_SEGMENT[type];
    const showSkeletons = isLoadingCarousels && carouselData.length === 0;

    const handleChipClick = useCallback((id: string) => {
        setActiveChip(id);
        setVisibleCount(ROW_BATCH);
    }, []);

    return (
        <div className="w-full" data-testid={`catalog-home-${type}`}>
            <HeroSection type={type} />

            <div className="px-4 md:px-10 lg:px-14 pb-12 pt-6 space-y-8 md:space-y-10">
                {continueWatching.length > 0 && (
                    <Row title={t('home.continueWatching')} viewAllLabel={t('catalog.loadMore')} itemWidth="wide">
                        {continueWatching.map(item => (
                            <Poster
                                key={`cw-${item.id}`}
                                href={item.href}
                                title={item.name}
                                image={item.image}
                                ratio="wide"
                                progress={item.duration > 0 ? item.progress / item.duration : undefined}
                            />
                        ))}
                    </Row>
                )}

                {favoritesLoaded && myList.length > 0 && (
                    <Row title={t('catalog.myList')} viewAllLabel={t('catalog.loadMore')} itemWidth="poster">
                        {myList.map(item => (
                            <Poster
                                key={`ml-${item.id}`}
                                href={item.href}
                                title={item.name}
                                image={item.image}
                                ratio="poster"
                            />
                        ))}
                    </Row>
                )}

                {chips.length > 1 && (
                    <div
                        className="row-scroller flex pb-1"
                        role="tablist"
                        aria-label={t('catalog.exploreCategories')}
                        data-testid="catalog-chips"
                    >
                        {chips.map(chip => (
                            <button
                                key={chip.id}
                                type="button"
                                role="tab"
                                aria-selected={activeChip === chip.id}
                                data-focusable="true"
                                tabIndex={0}
                                data-testid={`catalog-chip-${chip.id}`}
                                onClick={() => handleChipClick(chip.id)}
                                className={[
                                    'flex-shrink-0 mr-2 px-4 py-2 text-sm rounded-full border',
                                    activeChip === chip.id
                                        ? 'bg-ink text-bg border-ink'
                                        : 'bg-surface-2 text-ink-2 border-line hover:text-ink',
                                ].join(' ')}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>
                )}

                {showSkeletons && (
                    <>
                        <SkeletonRow itemWidth="poster" />
                        <SkeletonRow itemWidth="poster" />
                    </>
                )}

                {visibleRows.map(carousel => (
                    <Row
                        key={carousel.id}
                        title={carousel.title}
                        itemWidth="poster"
                        viewAllLabel={t('catalog.loadMore')}
                        onViewAll={carousel.categoryId
                            ? () => router.push(`/dashboard/${routeSegment}/${carousel.categoryId}`)
                            : undefined}
                    >
                        {carousel.data.map(item => (
                            <Poster
                                key={`${carousel.id}-${item.id}`}
                                href={item.type === 'movie'
                                    ? `/dashboard/watch/movie/${item.id}`
                                    : `/dashboard/watch/series/${item.id}`}
                                title={item.name}
                                image={item.image}
                                ratio="poster"
                                rating={item.rating}
                                year={item.year}
                            />
                        ))}
                    </Row>
                ))}

                {hasMore && (
                    <div ref={sentinelRef} className="flex justify-center py-4">
                        <button
                            type="button"
                            data-focusable="true"
                            tabIndex={0}
                            data-testid="catalog-load-more"
                            onClick={() => setVisibleCount(prev => Math.min(prev + ROW_BATCH, filteredRows.length))}
                            className="px-4 py-2 text-sm text-ink-2 hover:text-ink border border-line rounded-lg"
                        >
                            {t('catalog.loadMore')}
                        </button>
                    </div>
                )}

                <section className="pt-4 space-y-4" data-testid="catalog-explore">
                    <SectionHeader
                        title={t('catalog.exploreCategories')}
                        count={categoriesLoading ? undefined : sortedCategories.length}
                    />
                    {categoriesLoading ? (
                        <CardGrid base={2} md={3} lg={4} xl={5} gap={4}>
                            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                                <Skeleton key={index} className="min-h-[104px] rounded-xl" />
                            ))}
                        </CardGrid>
                    ) : sortedCategories.length === 0 ? (
                        <EmptyState title={t('catalog.noCategories')} />
                    ) : (
                        <CardGrid base={2} md={3} lg={4} xl={5} gap={4}>
                            {sortedCategories.map(category => (
                                <Link
                                    key={category.category_id}
                                    href={`/dashboard/${routeSegment}/${category.category_id}`}
                                    data-focusable="true"
                                    tabIndex={0}
                                    data-testid={`catalog-category-${category.category_id}`}
                                    className="spotlight-item flex items-center justify-between bg-surface-2 border border-line rounded-xl p-5 min-h-[104px]"
                                >
                                    <span className="text-sm md:text-base font-medium text-ink line-clamp-2">
                                        {cleanDisplayTitle(category.category_name)}
                                    </span>
                                    <ChevronRight className="text-ink-3 flex-shrink-0 ml-2" size={20} />
                                </Link>
                            ))}
                        </CardGrid>
                    )}
                </section>
            </div>
        </div>
    );
}
