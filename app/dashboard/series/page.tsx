'use client';

import CatalogHome from '@/components/catalog/CatalogHome';
import { useT } from '@/app/context/I18nContext';

export default function SeriesCategories() {
    const t = useT();
    return <CatalogHome type="series" title={t('catalog.seriesTitle')} />;
}
