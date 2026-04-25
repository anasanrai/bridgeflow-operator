"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CompanyProfile {
  company_name: string;
  industry: string;
  what_you_sell: string;
  target_client: string;
  agent_name: string;
  agent_tone: string;
  agent_persona: string;
  pricing_notes: string;
  objection_1_q: string;
  objection_1_a: string;
  objection_2_q: string;
  objection_2_a: string;
  objection_3_q: string;
  objection_3_a: string;
  booking_link: string;
  custom_instructions: string;
}

export const EMPTY_PROFILE: CompanyProfile = {
  company_name: "",
  industry: "",
  what_you_sell: "",
  target_client: "",
  agent_name: "Alex",
  agent_tone: "Professional",
  agent_persona: "",
  pricing_notes: "",
  objection_1_q: "",
  objection_1_a: "",
  objection_2_q: "",
  objection_2_a: "",
  objection_3_q: "",
  objection_3_a: "",
  booking_link: "",
  custom_instructions: "",
};

export const INDUSTRY_OPTIONS = [
  "Real Estate",
  "Medical",
  "Legal",
  "Agency",
  "E-commerce",
  "Other",
];

export const TONE_OPTIONS = [
  "Professional",
  "Conversational",
  "Direct",
  "Empathetic",
  "Consultative",
];

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useCompanyProfile() {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(EMPTY_PROFILE));

  // Initial load
  useEffect(() => {
    let abort = false;
    fetch("/api/company-profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then((data) => {
        if (abort) return;
        const next = { ...EMPTY_PROFILE, ...(data?.profile ?? {}) };
        setProfile(next);
        lastSaved.current = JSON.stringify(next);
        setLoaded(true);
      })
      .catch(() => {
        if (!abort) setLoaded(true);
      });
    return () => {
      abort = true;
    };
  }, []);

  const update = useCallback(
    (key: keyof CompanyProfile, value: string) => {
      setProfile((p) => ({ ...p, [key]: value }));
    },
    []
  );

  const save = useCallback(async (next?: CompanyProfile) => {
    const candidate = next ?? profile;
    const serialized = JSON.stringify(candidate);
    if (serialized === lastSaved.current) {
      setStatus("saved");
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const r = await fetch("/api/company-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized,
      });
      if (!r.ok) {
        let detail = `HTTP ${r.status}`;
        try {
          const j = await r.json();
          detail = `${detail} — ${j?.detail ?? ""}`;
        } catch {
          // ignore
        }
        setStatus("error");
        setError(detail);
        return;
      }
      const data = await r.json();
      const saved = { ...EMPTY_PROFILE, ...(data?.profile ?? candidate) };
      setProfile(saved);
      lastSaved.current = JSON.stringify(saved);
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError((err as Error).message);
    }
  }, [profile]);

  // Debounced auto-save: when any field changes, schedule a save 600ms later
  // (gives blur a chance to fire and gives the user time to keep typing).
  useEffect(() => {
    if (!loaded) return;
    const serialized = JSON.stringify(profile);
    if (serialized === lastSaved.current) return;
    const timer = setTimeout(() => {
      void save(profile);
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, loaded]);

  // Reset transient "saved" / "error" indicator after a moment.
  useEffect(() => {
    if (status === "saved") {
      const t = setTimeout(() => setStatus("idle"), 2000);
      return () => clearTimeout(t);
    }
    if (status === "error") {
      const t = setTimeout(() => setStatus("idle"), 6000);
      return () => clearTimeout(t);
    }
  }, [status]);

  return { profile, loaded, status, error, update, save };
}
