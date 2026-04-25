"use client";

import { useCallback, useRef, useState } from "react";
import {
  IconMic,
  IconRefresh,
  IconUpload,
  IconWaveform,
} from "../lib/icons";

interface Props {
  running: boolean;
  /** Called once Whisper returns a transcript. The page should auto-run the
   *  pipeline with this string. */
  onTranscribed: (transcript: string) => void;
  onReset: () => void;
}

const ACCEPT = ".mp3,.wav,.m4a,audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/mp4,audio/m4a,audio/x-m4a";
const ALLOWED_EXT = new Set(["mp3", "wav", "m4a"]);
const MAX_BYTES = 25 * 1024 * 1024;

type Status = "idle" | "uploading" | "transcribing" | "done" | "error";

interface Result {
  transcript: string;
  duration_seconds: number | null;
  language: string;
  model: string;
}

export function AudioUpload({ running, onTranscribed, onReset }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setStatus("idle");
    setError(null);
    setResult(null);
    setFilename(null);
    onReset();
  }, [onReset]);

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      if (!ALLOWED_EXT.has(ext)) {
        setStatus("error");
        setError(`Unsupported file type: .${ext || "?"} — use .mp3, .wav, or .m4a`);
        return;
      }
      if (file.size > MAX_BYTES) {
        setStatus("error");
        setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — Groq Whisper limit is 25 MB`);
        return;
      }

      setError(null);
      setFilename(file.name);
      setStatus("uploading");
      setResult(null);

      const form = new FormData();
      form.append("file", file);

      // XHR so we can show real upload progress, then flip to "transcribing".
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", "/api/transcribe");
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.loaded === ev.total) setStatus("transcribing");
      };
      xhr.onload = () => {
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText) as Result;
            setResult(data);
            setStatus("done");
            if (data.transcript) onTranscribed(data.transcript);
          } catch {
            setStatus("error");
            setError("Got 200 but response was not JSON");
          }
        } else {
          let detail = `HTTP ${xhr.status}`;
          try {
            const j = JSON.parse(xhr.responseText);
            if (j?.detail) detail = `${detail} — ${j.detail}`;
          } catch {
            if (xhr.responseText) detail = `${detail} — ${xhr.responseText.slice(0, 200)}`;
          }
          setStatus("error");
          setError(detail);
        }
      };
      xhr.onerror = () => {
        xhrRef.current = null;
        setStatus("error");
        setError("Network error contacting /api/transcribe");
      };
      xhr.onabort = () => {
        xhrRef.current = null;
      };
      xhr.send(form);
    },
    [onTranscribed]
  );

  const onPick = (f?: File) => {
    if (!f) return;
    void handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (running || status === "uploading" || status === "transcribing") return;
    onPick(e.dataTransfer.files?.[0]);
  };

  const busy =
    running || status === "uploading" || status === "transcribing";

  const statusLabel: Record<Status, string> = {
    idle: "Drop an audio file or click to upload",
    uploading: "Uploading…",
    transcribing: "Transcribing with Groq Whisper-large-v3-turbo…",
    done: "Transcription complete",
    error: "Transcription failed",
  };

  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Voice call</h2>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-300/90 bg-amber-500/10">
              V2 Beta
            </span>
            <span className="text-[10px] font-mono text-faint px-1.5 py-0.5 rounded border border-border">
              groq · whisper-large-v3-turbo
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Drop an .mp3, .wav, or .m4a — we transcribe it, then auto-run the 5-agent pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            disabled={busy && status !== "error"}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-40 transition-colors cursor-pointer"
          >
            <IconRefresh className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative flex flex-col items-center justify-center gap-3 h-44 rounded-lg border-2 border-dashed transition-colors cursor-pointer
            ${
              dragOver
                ? "border-amber-400/60 bg-amber-500/5"
                : busy
                ? "border-border bg-bg cursor-progress"
                : "border-border bg-bg hover:border-amber-500/40 hover:bg-amber-500/[0.03]"
            }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files?.[0] ?? undefined);
              e.target.value = "";
            }}
          />

          {status === "uploading" || status === "transcribing" ? (
            <Spinner />
          ) : status === "done" ? (
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center">
              <IconWaveform className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-center">
              <IconMic className="w-5 h-5" />
            </div>
          )}

          <div className="text-center">
            <div className="text-sm text-ink font-medium">{statusLabel[status]}</div>
            <div className="text-[11px] text-muted mt-1 font-mono">
              {filename ?? ".mp3 · .wav · .m4a · up to 25 MB"}
            </div>
          </div>
        </label>

        {error && (
          <div className="text-xs rounded-md border border-hot/40 bg-hot/5 text-hot px-3 py-2">
            {error}
          </div>
        )}

        {result && status === "done" && (
          <div className="rounded-md border border-border bg-bg/60 p-3 space-y-2">
            <div className="flex items-center gap-3 text-[11px] font-mono text-muted">
              <span className="inline-flex items-center gap-1.5 text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {result.model}
              </span>
              {result.duration_seconds != null && (
                <span>· {result.duration_seconds.toFixed(1)}s audio</span>
              )}
              <span>· lang {String(result.language).toLowerCase().slice(0, 2)}</span>
            </div>
            <div className="text-[12px] text-ink-muted leading-relaxed font-mono whitespace-pre-wrap max-h-32 overflow-auto scrollbar-thin">
              {result.transcript}
            </div>
            <div className="text-[11px] text-amber-300/90">
              Pipeline started automatically — watch the agents on the right.
            </div>
          </div>
        )}

        {!busy && status !== "done" && (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full inline-flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15 transition-colors cursor-pointer"
          >
            <IconUpload className="w-3.5 h-3.5" />
            Choose audio file
          </button>
        )}
      </div>
    </section>
  );
}

function Spinner() {
  return (
    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-center">
      <svg
        className="w-5 h-5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
    </div>
  );
}
