import { NextRequest, NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { translateForRequest } from '@/app/lib/i18n';
import {
    listProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    ensureKidProfile,
    getProfile,
    getRequestAccount,
    ProfilePrefs,
    MAX_PROFILES,
} from '@/app/lib/userStore';
import { isKnownAvatar, isKidAvatar } from '@/app/lib/avatars';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Action = 'create' | 'update' | 'delete';

interface ProfilesRequestBody {
    action: Action;
    id?: string;
    name?: string;
    avatar?: string;
    isKid?: boolean;
    prefs?: Partial<ProfilePrefs>;
}

/** Caps create so Kid (auto, after the first normal profile) always fits plan. */
function planCap(account: string): number {
    // Server does not know max_connections here; MAX_PROFILES is the hard cap.
    // Plan enforcement is client-side (maxProfilesForPlan) + this hard limit.
    void account;
    return MAX_PROFILES;
}

/**
 * Avatar must match the profile kind: Kid only `kid-*`, adult never `kid-*`.
 * Returns null when the request is valid (or avatar omitted → keep current).
 */
function resolveAvatar(
    requested: string | undefined,
    isKid: boolean
): { avatar?: string; invalid?: boolean } {
    if (requested === undefined) return {};
    if (!requested || !isKnownAvatar(requested)) return { invalid: true };
    if (isKid !== isKidAvatar(requested)) return { invalid: true };
    return { avatar: requested };
}

export async function GET(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const account = getRequestAccount(request);
        return NextResponse.json({ data: listProfiles(account) });
    } catch (error) {
        console.error('[Profiles] Failed to list profiles', error);
        return NextResponse.json({ error: 'Falha ao carregar perfis' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const body = await request.json() as ProfilesRequestBody;
        const account = getRequestAccount(request) ?? '';

        switch (body.action) {
            case 'create': {
                const name = body.name?.trim();
                if (!name) {
                    return NextResponse.json({ error: translateForRequest(request, 'serverErrors.profileNameRequired') }, { status: 400 });
                }
                // Kid is system-owned (created only by ensureKidProfile after the first adult).
                if (body.isKid === true) {
                    return NextResponse.json(
                        { error: translateForRequest(request, 'serverErrors.profileNotFound') },
                        { status: 400 }
                    );
                }
                const existing = listProfiles(account);
                if (existing.length >= planCap(account)) {
                    return NextResponse.json(
                        { error: translateForRequest(request, 'serverErrors.profileLimitReached') },
                        { status: 400 }
                    );
                }

                const isKid = false;
                const avatarCheck = resolveAvatar(body.avatar, isKid);
                if (avatarCheck.invalid) {
                    return NextResponse.json(
                        { error: translateForRequest(request, 'serverErrors.invalidProfileAvatar') },
                        { status: 400 }
                    );
                }
                const profile = createProfile({ name, avatar: avatarCheck.avatar, isKid, account });

                // First normal profile for this account → append the Kid profile
                // (only after the main one exists; never seed Kid alone).
                let kidCreated = false;
                if (!isKid && existing.length === 0) {
                    ensureKidProfile(account);
                    kidCreated = true;
                }

                return NextResponse.json({
                    data: profile,
                    profiles: listProfiles(account),
                    kidCreated,
                });
            }

            case 'update': {
                if (!body.id) {
                    return NextResponse.json({ error: translateForRequest(request, 'serverErrors.profileIdRequired') }, { status: 400 });
                }
                const target = getProfile(body.id);
                if (!target) {
                    return NextResponse.json({ error: translateForRequest(request, 'serverErrors.profileNotFound') }, { status: 404 });
                }
                // Cross-account writes are not allowed when the request states an account.
                if (account && target.account && target.account !== account) {
                    return NextResponse.json({ error: translateForRequest(request, 'serverErrors.profileNotFound') }, { status: 404 });
                }

                const name = body.name?.trim();
                if (body.name !== undefined && !name) {
                    return NextResponse.json({ error: translateForRequest(request, 'serverErrors.profileNameRequired') }, { status: 400 });
                }

                // isKid is never flipped by the client — kind is fixed at create (Kid is system-owned).
                const isKid = target.isKid;
                const avatarCheck = resolveAvatar(body.avatar, isKid);
                if (avatarCheck.invalid) {
                    return NextResponse.json(
                        { error: translateForRequest(request, 'serverErrors.invalidProfileAvatar') },
                        { status: 400 }
                    );
                }

                const profile = updateProfile(body.id, {
                    name,
                    avatar: avatarCheck.avatar,
                    prefs: body.prefs,
                });
                if (!profile) {
                    return NextResponse.json({ error: translateForRequest(request, 'serverErrors.profileNotFound') }, { status: 404 });
                }
                return NextResponse.json({ data: profile });
            }

            case 'delete': {
                if (!body.id) {
                    return NextResponse.json({ error: translateForRequest(request, 'serverErrors.profileIdRequired') }, { status: 400 });
                }
                const target = getProfile(body.id);
                if (!target) {
                    return NextResponse.json({ error: translateForRequest(request, 'serverErrors.profileNotFound') }, { status: 404 });
                }
                if (account && target.account && target.account !== account) {
                    return NextResponse.json({ error: translateForRequest(request, 'serverErrors.profileNotFound') }, { status: 404 });
                }
                if (target.isKid) {
                    return NextResponse.json(
                        { error: translateForRequest(request, 'serverErrors.cannotDeleteKid') },
                        { status: 400 }
                    );
                }
                if (!deleteProfile(body.id)) {
                    return NextResponse.json(
                        { error: translateForRequest(request, 'serverErrors.cannotDeleteLastProfile') },
                        { status: 400 }
                    );
                }
                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
        }
    } catch (error) {
        console.error('[Profiles] Failed to update profiles', error);
        return NextResponse.json({ error: 'Falha ao salvar perfil' }, { status: 500 });
    }
}
