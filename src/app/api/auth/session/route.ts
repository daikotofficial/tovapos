import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireAuth } from '@/lib/server/security';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    return NextResponse.json({
      user: auth.user,
      tenant: { id: auth.tenantId, slug: auth.tenantSlug, name: auth.tenantName },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
