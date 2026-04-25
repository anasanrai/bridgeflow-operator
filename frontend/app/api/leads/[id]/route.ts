import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const body = await req.text();
  const upstream = await fetch(`${BACKEND_URL}/leads/${ctx.params.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const upstream = await fetch(`${BACKEND_URL}/leads/${ctx.params.id}`, {
    method: "DELETE",
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}
