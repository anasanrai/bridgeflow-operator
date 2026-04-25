import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ALLOWED = new Set(["approve", "skip", "edit"]);

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string; action: string } }
) {
  const action = (ctx.params.action || "").toLowerCase();
  if (!ALLOWED.has(action)) {
    return new Response(
      JSON.stringify({ detail: `unknown action: ${action}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const body = action === "edit" ? await req.text() : "";
  const upstream = await fetch(
    `${BACKEND_URL}/approvals/${ctx.params.id}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body || undefined,
    }
  );
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}
