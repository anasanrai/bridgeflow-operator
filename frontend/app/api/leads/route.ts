import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  try {
    const res = await fetch(`${BACKEND_URL}/leads${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    });
    if (!res.ok) return Response.json({ source: "demo", leads: [] }, { status: 200 });
    const data = await res.json();
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ source: "demo", leads: [] }, { status: 200 });
  }
}
