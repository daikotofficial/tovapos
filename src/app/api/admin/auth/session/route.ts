import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/server/security';
import { requirePlatformAdmin } from '@/lib/server/platform-admin';

export async function GET(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin(request);
    return NextResponse.json({ admin });
  } catch (error) {
    return errorResponse(error);
  }
}
