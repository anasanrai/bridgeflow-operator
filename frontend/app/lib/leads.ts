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

const DAY = 86_400_000;

// Deterministic seed so the demo always looks good.
// Timestamps are relative to "now" so the table shows a sensible "recent".
export function demoLeads(now = Date.now()): Lead[] {
  return [
    {
      id: "demo-1",
      name: "Jake Rivera",
      company: "Frisco Realty",
      email: "jake@frisco-realty.com",
      phone: "+1 469 555 0117",
      score: "hot",
      decision: "book_call_immediately",
      estimated_deal_value: "$18,000 pilot",
      created_at: new Date(now - 0.3 * DAY).toISOString(),
    },
    {
      id: "demo-2",
      name: "Priya Shah",
      company: "Shah & Co Legal",
      email: "priya@shahco.law",
      phone: null,
      score: "hot",
      decision: "book_call_immediately",
      estimated_deal_value: "$12,000 ARR",
      created_at: new Date(now - 0.8 * DAY).toISOString(),
    },
    {
      id: "demo-3",
      name: "Marcus Chen",
      company: "Chen Plumbing Group",
      email: "marcus@chenplumbing.com",
      phone: "+1 214 555 0189",
      score: "warm",
      decision: "send_nurture_sequence",
      estimated_deal_value: "$7,500",
      created_at: new Date(now - 1.4 * DAY).toISOString(),
    },
    {
      id: "demo-4",
      name: "Elena Morales",
      company: "Morales Wealth Partners",
      email: "elena@moraleswealth.com",
      phone: "+1 305 555 0142",
      score: "warm",
      decision: "send_nurture_sequence",
      estimated_deal_value: "$24,000 ARR",
      created_at: new Date(now - 2.1 * DAY).toISOString(),
    },
    {
      id: "demo-5",
      name: "David Okafor",
      company: "Okafor Dental",
      email: "d.okafor@okafordental.com",
      phone: null,
      score: "cold",
      decision: "send_single_followup",
      estimated_deal_value: "Unknown",
      created_at: new Date(now - 3.0 * DAY).toISOString(),
    },
    {
      id: "demo-6",
      name: "Yuki Tanaka",
      company: "Tanaka Studio",
      email: "yuki@tanakastudio.jp",
      phone: null,
      score: "hot",
      decision: "book_call_immediately",
      estimated_deal_value: "$9,600",
      created_at: new Date(now - 3.6 * DAY).toISOString(),
    },
    {
      id: "demo-7",
      name: "Sam Robinson",
      company: "Robinson Roofing",
      email: "sam@robinsonroof.com",
      phone: "+1 512 555 0108",
      score: "warm",
      decision: "send_single_followup",
      estimated_deal_value: "$4,200",
      created_at: new Date(now - 4.2 * DAY).toISOString(),
    },
    {
      id: "demo-8",
      name: "Nadia Faris",
      company: "Faris Logistics",
      email: "nadia@farislogistics.com",
      phone: null,
      score: "cold",
      decision: "disqualify",
      estimated_deal_value: "—",
      created_at: new Date(now - 5.5 * DAY).toISOString(),
    },
    {
      id: "demo-9",
      name: "Ahmed Rashid",
      company: "Rashid Motors",
      email: "ahmed@rashidmotors.sa",
      phone: "+966 50 555 0194",
      score: "hot",
      decision: "book_call_immediately",
      estimated_deal_value: "$31,000",
      created_at: new Date(now - 6.0 * DAY).toISOString(),
    },
    {
      id: "demo-10",
      name: "Chloé Martin",
      company: "Martin Boutique",
      email: "chloe@martin-boutique.fr",
      phone: null,
      score: "cold",
      decision: "send_nurture_sequence",
      estimated_deal_value: "Unknown",
      created_at: new Date(now - 7.8 * DAY).toISOString(),
    },
    {
      id: "demo-11",
      name: "Benjamin Park",
      company: "Park Physical Therapy",
      email: "ben@parkpt.com",
      phone: null,
      score: "warm",
      decision: "send_nurture_sequence",
      estimated_deal_value: "$6,800",
      created_at: new Date(now - 9.2 * DAY).toISOString(),
    },
    {
      id: "demo-12",
      name: "Isabela Costa",
      company: "Costa Architects",
      email: "isabela@costa-arch.com.br",
      phone: null,
      score: "hot",
      decision: "book_call_immediately",
      estimated_deal_value: "$14,500",
      created_at: new Date(now - 10.7 * DAY).toISOString(),
    },
  ];
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
