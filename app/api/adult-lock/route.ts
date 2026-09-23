import { NextRequest, NextResponse } from 'next/server';
import {
    ADULT_LOCK_COOKIE_NAME,
    ADULT_UNLOCK_SECONDS,
    changeAdultPin,
    createAdultUnlockCookieValue,
    getAdultPinHash,
    isAdultUnlocked,
    isSecureRequest,
    isValidAdultPin,
    verifyAdultPin,
} from '@/app/lib/adultLock';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { getProfile, resolveProfileId } from '@/app/lib/userStore';
import { translateForRequest } from '@/app/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    const profileId = resolveProfileId(request);
    const profile = profileId ? getProfile(profileId) : null;
    const kid = profile?.isKid === true;
    const unlocked = kid ? false : await isAdultUnlocked(request);

    return NextResponse.json({ locked: kid || !unlocked, kid });
}

export async function POST(request: NextRequest) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'status') {
        const profileId = resolveProfileId(request);
        const profile = profileId ? getProfile(profileId) : null;
        const kid = profile?.isKid === true;
        const unlocked = kid ? false : await isAdultUnlocked(request);
        return NextResponse.json({ locked: kid || !unlocked, kid });
    }

    if (action === 'verify') {
        if (!isValidAdultPin(body.pin)) {
            return NextResponse.json(
                { error: translateForRequest(request, 'serverErrors.adultPinRule') },
                { status: 400 }
            );
        }
        if (!(await verifyAdultPin(body.pin))) {
            return NextResponse.json(
                { error: translateForRequest(request, 'serverErrors.adultPinInvalid') },
                { status: 401 }
            );
        }

        const response = NextResponse.json({ success: true, locked: false });
        response.cookies.set({
            name: ADULT_LOCK_COOKIE_NAME,
            value: createAdultUnlockCookieValue(await getAdultPinHash()),
            httpOnly: true,
            sameSite: 'lax',
            secure: isSecureRequest(request),
            path: '/',
            maxAge: ADULT_UNLOCK_SECONDS,
        });
        return response;
    }

    if (action === 'change') {
        if (!isValidAdultPin(body.newPin)) {
            return NextResponse.json(
                { error: translateForRequest(request, 'serverErrors.adultPinRule') },
                { status: 400 }
            );
        }
        const ok = await changeAdultPin(String(body.currentPin ?? ''), body.newPin);
        if (!ok) {
            return NextResponse.json(
                { error: translateForRequest(request, 'serverErrors.adultPinInvalid') },
                { status: 401 }
            );
        }
        return NextResponse.json({ success: true });
    }

    if (action === 'lock') {
        const response = NextResponse.json({ success: true, locked: true });
        response.cookies.set({
            name: ADULT_LOCK_COOKIE_NAME,
            value: '',
            httpOnly: true,
            sameSite: 'lax',
            secure: isSecureRequest(request),
            path: '/',
            maxAge: 0,
        });
        return response;
    }

    return NextResponse.json({ error: 'Invalid adult-lock action' }, { status: 400 });
}
