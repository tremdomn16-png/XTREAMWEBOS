'use client';

import { useState } from 'react';
import { SortOption } from '@/components/SortControls';

function readSavedSort(key: string): SortOption | null {
    if (typeof window === 'undefined') return null;
    try {
        return localStorage.getItem(`xstream_sort_${key}`) as SortOption | null;
    } catch {
        return null;
    }
}

interface SortState {
    key: string;
    sort: SortOption;
    isLoaded: boolean;
}

export function useSortPreference(key: string, defaultValue: SortOption = 'added') {
    // SSR-safe: start at the default; hydrate from localStorage during the first
    // client render (and again when `key` changes) without an effect setState.
    const [state, setState] = useState<SortState>(() => ({
        key,
        sort: defaultValue,
        isLoaded: false,
    }));

    if (typeof window !== 'undefined' && (!state.isLoaded || state.key !== key)) {
        setState({
            key,
            sort: readSavedSort(key) ?? defaultValue,
            isLoaded: true,
        });
    }

    const updateSort = (newSort: SortOption) => {
        setState((prev) => ({ ...prev, sort: newSort }));
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem(`xstream_sort_${key}`, newSort);
            } catch {
                /* storage unavailable — in-memory only for this session */
            }
        }
    };

    return [state.sort, updateSort, state.isLoaded] as const;
}
