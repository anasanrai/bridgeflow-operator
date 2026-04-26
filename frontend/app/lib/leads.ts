export interface Lead {
  id: string;
  call_id?: string | null;
  name: string | null;
  company: string | null;
  email: string | null;
  phone?: string | null;
  score: "hot" | "warm" | "cold" | string | null;
  decision: string | null;
  estimated_deal_value?: string | null;
  status?: string | null;     // active | archived
  created_at: string;
}

export interface LeadsResponse {
  source: "supabase" | "demo";
  leads: Lead[];
}

export function fmtRelative(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function fmtDecision(d: string | null | undefined): string {
  if (!d) return "—";
  return d.replace(/_/g, " ");
}
