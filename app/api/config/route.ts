import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { isErrnoCode } from '@/app/lib/nodeErrors';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

export async function GET(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        return NextResponse.json(JSON.parse(data));
    } catch (error) {
        if (isErrnoCode(error, 'ENOENT')) {
            return NextResponse.json({});
        }
        return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const body = await request.json();
        await fs.writeFile(CONFIG_PATH, JSON.stringify(body, null, 2));
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }
}
