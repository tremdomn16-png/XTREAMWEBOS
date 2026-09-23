'use client';

import CatalogHome from '@/components/catalog/CatalogHome';
import { useT } from '@/app/context/I18nContext';

export default function MovieCategories() {
    const t = useT();
    return <CatalogHome type="movie" title={t('catalog.moviesTitle')} />;
}
