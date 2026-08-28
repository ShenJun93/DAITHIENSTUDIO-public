import { NextResponse } from 'next/server';
import { route } from '@/app/api/_lib/handler';
import { getComfyUiStatus } from '@/infrastructure/providers/comfyuiStatus';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const status = await getComfyUiStatus();
  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'no-store' },
  });
});
