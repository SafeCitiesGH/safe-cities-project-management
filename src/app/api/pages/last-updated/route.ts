import { type NextRequest, NextResponse } from 'next/server';
import { db } from '~/server/db'; // adjust path to your db instance
import { pageContent } from '~/server/db/schema'; // adjust path as needed

export async function GET(req: NextRequest) {
  const pageId = req.nextUrl.searchParams.get('pageId');
  if (!pageId) return NextResponse.json({ error: 'Missing pageId' }, { status: 400 });

  const page = await db.query.pageContent.findFirst({
    where: (p, { eq }) => eq(p.fileId, Number(pageId)),
    columns: {
      updatedAt: true,
      content: true,
    },
  });

  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    lastUpdated: page.updatedAt?.toISOString() ?? null,
    content: page.content,
  });
}