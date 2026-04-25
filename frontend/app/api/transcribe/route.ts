import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  // Forward the multipart body straight through. We can't read it as text
  // because it would re-encode binary data; pass the original stream and
  // preserve the Content-Type (which carries the multipart boundary).
  const contentType = req.headers.get("content-type");
  if (!contentType || !contentType.includes("multipart/form-data")) {
    return Response.json({ error: "expected multipart/form-data" }, { status: 415 });
  }

  const upstream = await fetch(`${BACKEND_URL}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: req.body as any,
    // @ts-expect-error — Node 18+ undici fetch requires this for streaming bodies
    duplex: "half",
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}
