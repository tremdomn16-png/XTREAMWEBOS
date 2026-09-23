'use client';

import NavRail from '@/components/NavRail';
import BottomNav from '@/components/BottomNav';
import MobileHeader from '@/components/MobileHeader';
import Loader from '@/components/Loader';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAutoFocusMainContent } from '../hooks/useAutoFocusMainContent';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const mainRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/');
        }
    }, [isAuthenticated, isLoading, router]);

    useAutoFocusMainContent(mainRef);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg text-ink">
                <Loader />
            </div>
        );
    }

    if (!isAuthenticated) return null;

    return (
        <div className="flex flex-col md:flex-row h-screen bg-bg overflow-hidden">
            <NavRail />
            {/* Phone: sticky top bar outside the scroll area (nav rail is hidden below md). */}
            <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                <MobileHeader />
                <main ref={mainRef} className="flex-1 overflow-y-auto pb-16 md:pb-0">
                    <div className="max-w-[1800px] mx-auto min-h-full">{children}</div>
                </main>
            </div>
            <BottomNav />
        </div>
    );
}
