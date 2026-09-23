'use client';

import { Suspense } from 'react';
import PairPage from './page-content';

export default function PairShell() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-bg" />}>
            <PairPage />
        </Suspense>
    );
}
