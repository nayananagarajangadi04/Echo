"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CircleAlert,
  CircleDashed,
  CircleCheck,
  Keyboard,
  Mic,
  Pause,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import type { CaptureResult } from "@/lib/types";
import { apiSend } from "@/lib/echo-context";
import { cn } from "@/lib/cn";
import { Btn, Card, StatusChip, inputCls } from "@/components/ui";

type Stage = "idle" | "recording" | "review" | "processing" | "done" | "mic-error" | "transcribe-error";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechEventLike = {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean } & ArrayLike<unknown>>;
};

type SRWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BARS = 22;

export function CapturePanel({
  onSaved,
  className = "",
}: {
  onSaved?: () => void;
  className?: string;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [liveText, setLiveText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [typedText, setTypedText] = useState("");
  const [showTyped, setShowTyped] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [micName, setMicName] = useState("Default microphone");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const srRef = useRef<SpeechRecognitionLike | null>(null);
  const srActiveRef = useRef(false);
  const transcriptFinalRef = useRef("");

  const srAvailable = (() => {
    if (typeof window === "undefined") return false;
    const w = window as SRWindow;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  })();

  const cleanupMedia = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (srRef.current && srActiveRef.current) {
      try {
        srRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
    srActiveRef.current = false;
    srRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanupMedia, [cleanupMedia]);

  function startSpeechRecognition() {
    const w = window as SRWindow;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const sr = new SR();
    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = navigator.language || "en-US";
    sr.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalRef.current += res[0].transcript.trim() + " ";
        } else {
          interim += res[0].transcript;
        }
      }
      interimRef.current = interim;
      setLiveText((finalRef.current + interim).trim());
    };
    sr.onerror = () => {
      srActiveRef.current = false;
    };
    sr.onend = () => {
      srActiveRef.current = false;
      if (streamRef.current && !paused) {
        try {
          sr.start();
          srActiveRef.current = true;
        } catch {
          /* restart race — ignore */
        }
      }
    };
    try {
      sr.start();
      srActiveRef.current = true;
      srRef.current = sr;
    } catch {
      /* ignore */
    }
  }

  async function startRecording() {
    setNotice(null);
    setResult(null);
    finalRef.current = "";
    interimRef.current = "";
    transcriptFinalRef.current = "";
    setLiveText("");
    setTranscript("");
    setElapsed(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      setMicName(track?.label || "Microphone");
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const target = Math.min(1, Math.max(0.08, rms * 3.2));
        setLevels((prev) => prev.map((p, i) => p * 0.55 + target * (0.45 + 0.3 * Math.sin(i * 1.7))));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      timerRef.current = setInterval(() => {
        if (!paused) setElapsed((s) => s + 1);
      }, 1000);

      if (srAvailable) startSpeechRecognition();
      setPaused(false);
      setStage("recording");
    } catch {
      cleanupMedia();
      setStage("mic-error");
    }
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (paused) {
      recorder.resume();
      if (srAvailable && !srActiveRef.current) startSpeechRecognition();
      setPaused(false);
    } else {
      recorder.pause();
      if (srRef.current && srActiveRef.current) {
        try {
          srRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      setPaused(true);
      setLevels(Array(BARS).fill(0.08));
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    cleanupMedia();
    const spoken = (finalRef.current + interimRef.current).trim();
    setPaused(false);
    if (!spoken) {
      // Nothing captured on-device — try server transcription from the recording.
      const blob = new Blob(chunksRef.current, { type: recorder?.mimeType || "audio/webm" });
      if (blob.size > 1000) {
        setStage("processing");
        setNotice("Transcribing your recording…");
        const form = new FormData();
        form.append("audio", blob, "capture.webm");
        try {
          const res = await fetch("/api/capture/audio", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Server transcription failed");
          transcriptFinalRef.current = data.transcript as string;
          setTranscript(data.transcript as string);
          setStage("review");
        } catch (err) {
          setTranscript("");
          setNotice(
            err instanceof Error ? err.message : "Could not transcribe. Type what you said instead."
          );
          setStage("review");
        }
        return;
      }
      setNotice("We didn't hear anything. Record again, or type what you said.");
      setStage("review");
      return;
    }
    transcriptFinalRef.current = spoken;
    setTranscript(spoken);
    setStage("review");
  }

  async function saveCapture() {
    const text = transcript.trim();
    if (text.length < 3) {
      setNotice("A transcript is required — ECHO stores exactly what you said.");
      return;
    }
    setStage("processing");
    setNotice("AI is listening for what matters…");
    try {
      const data = await apiSend<CaptureResult>("/api/capture/save", "POST", {
        transcript: text,
        source: "voice",
        durationSec: elapsed,
      });
      setResult(data);
      setNotice(null);
      setStage("done");
      onSaved?.();
    } catch (err) {
      setResult(null);
      setNotice(err instanceof Error ? err.message : "Capture failed");
      setStage("review");
    }
  }

  async function saveTyped() {
    const text = typedText.trim();
    if (text.length < 10) {
      setNotice("Write at least a sentence so there is something to remember.");
      return;
    }
    setStage("processing");
    setNotice("AI is listening for what matters…");
    try {
      const data = await apiSend<CaptureResult>("/api/capture/text", "POST", { text });
      setResult(data);
      setNotice(null);
      setStage("done");
      onSaved?.();
    } catch (err) {
      setResult(null);
      setNotice(err instanceof Error ? err.message : "Capture failed");
      setShowTyped(true);
      setStage("idle");
    }
  }

  function reset() {
    setStage("idle");
    setPaused(false);
    setResult(null);
    setNotice(null);
    setTranscript("");
    setTypedText("");
    setLiveText("");
    setElapsed(0);
    setShowTyped(false);
  }

  const recording = stage === "recording";

  return (
    <Card
      className={cn("overflow-hidden", className)}
      title={
        <span className="flex items-center gap-2">
          <Mic className="h-3.5 w-3.5 text-accent-2" />
          <span className="micro">Capture a memory</span>
        </span>
      }
      action={
        stage === "idle" && (
          <button
            onClick={() => setShowTyped((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-dim transition hover:text-fg"
          >
            <Keyboard className="h-3 w-3" /> {showTyped ? "Record instead" : "Type instead"}
          </button>
        )
      }
    >
      <AnimatePresence mode="wait">
        {stage === "idle" && !showTyped && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex flex-col items-center py-6">
              <button
                onClick={() => void startRecording()}
                className="group flex h-20 w-20 items-center justify-center rounded-full grad-accent text-white shadow-lg transition hover:scale-105 active:scale-95"
                aria-label="Start recording"
              >
                <Mic className="h-8 w-8" strokeWidth={2} />
              </button>
              <p className="mt-4 text-sm font-medium text-fg-strong">Talk to your future self</p>
              <p className="mt-1 max-w-xs text-center text-xs leading-relaxed text-dim">
                What happened today? What are you stuck on? ECHO transcribes it word-for-word, then
                finds the goals, problems and decisions inside.
              </p>
              {srAvailable && (
                <p className="mt-2 text-[11px] text-dim">
                  Live on-device transcription · {micName === "Default microphone" ? "mic ready" : micName}
                </p>
              )}
            </div>
          </motion.div>
        )}

        {stage === "idle" && showTyped && (
          <motion.div key="typed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <textarea
              autoFocus
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              rows={5}
              placeholder="Today I finally shipped the proposal. It went well, though I rushed the ending — next time I'll leave an hour to review…"
              className={cn(inputCls, "resize-none leading-relaxed")}
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-dim">{typedText.trim().length} characters</span>
              <Btn variant="primary" disabled={typedText.trim().length < 10} onClick={() => void saveTyped()}>
                Save & analyze
              </Btn>
            </div>
          </motion.div>
        )}

        {recording && (
          <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div
              className={cn(
                "flex flex-col items-center rounded-xl border px-4 py-6 transition-colors",
                paused ? "border-line bg-panel-2" : "border-rose-500/25 bg-rose-500/[0.04]"
              )}
            >
              <div className="flex items-center gap-2">
                {!paused && (
                  <span className="h-2 w-2 rounded-full bg-rose-soft rec-pulse" aria-hidden />
                )}
                <span className="font-mono text-lg tabular-nums text-fg-strong">{fmt(elapsed)}</span>
                <span className="micro">{paused ? "· paused" : "· recording"}</span>
              </div>
              <div className="mt-4 flex h-10 items-end gap-[3px]" aria-hidden>
                {levels.map((lvl, i) => (
                  <span
                    key={i}
                    className="w-[4px] rounded-full transition-[height] duration-100"
                    style={{
                      height: `${Math.max(3, lvl * 40)}px`,
                      backgroundColor: paused ? "#262c3d" : i % 3 === 0 ? "#7c6cf6" : "#4cc2ff",
                      opacity: paused ? 0.6 : 0.55 + lvl * 0.45,
                    }}
                  />
                ))}
              </div>
              <p className="mt-4 min-h-[2.5rem] max-w-md text-center text-[13px] leading-relaxed text-muted">
                {liveText ? `“${liveText}”` : paused ? "Paused — resume when ready." : "Listening… start talking about your day."}
              </p>
              {!srAvailable && (
                <p className="mt-1 text-center text-[11px] text-dim">
                  Server transcription will run when you stop.
                </p>
              )}
              <div className="mt-4 flex items-center gap-2">
                <Btn onClick={togglePause}>
                  {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {paused ? "Resume" : "Pause"}
                </Btn>
                <Btn variant="primary" onClick={() => void stopRecording()}>
                  <Square className="h-3.5 w-3.5" /> Stop & review
                </Btn>
              </div>
            </div>
          </motion.div>
        )}

        {stage === "review" && (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="micro">Review transcript — ECHO stores exactly this</span>
              <span className="font-mono text-[11px] tabular-nums text-dim">{fmt(elapsed)}</span>
            </div>
            <textarea
              autoFocus
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={6}
              placeholder="What did you say? Type or fix the transcript here."
              className={cn(inputCls, "resize-none leading-relaxed")}
            />
            {notice && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                <span className="text-[11px] leading-relaxed text-amber-200/90">{notice}</span>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <Btn variant="ghost" onClick={reset}>
                <Trash2 className="h-3.5 w-3.5" /> Discard
              </Btn>
              <Btn variant="primary" disabled={transcript.trim().length < 3} onClick={() => void saveCapture()}>
                Save & analyze
              </Btn>
            </div>
          </motion.div>
        )}

        {stage === "processing" && (
          <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex flex-col items-center py-10">
              <div className="flex items-end gap-1" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full grad-accent"
                    style={{
                      height: `${8 + (i % 3) * 8}px`,
                      animation: `eq 1s ease-in-out ${i * 0.15}s infinite`,
                    }}
                  />
                ))}
              </div>
              <p className="mt-4 text-sm font-medium text-fg-strong">{notice || "Working…"}</p>
            </div>
          </motion.div>
        )}

        {stage === "done" && result && (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {result.status === "analyzed" ? (
                  <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-soft" />
                ) : result.status === "pending" ? (
                  <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                ) : (
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
                )}
                <div>
                  <p className="text-sm font-medium text-fg-strong">
                    {result.status === "analyzed"
                      ? `Captured — ${result.extracted.length} ${result.extracted.length === 1 ? "memory" : "memories"} extracted`
                      : result.status === "pending"
                        ? "Transcript saved"
                        : "Saved, but analysis failed"}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-dim">
                    {result.message}
                  </p>
                </div>
              </div>
              <StatusChip status={result.status} error={result.warnings?.join(" · ")} />
            </div>
            {result.extracted.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {result.extracted.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2"
                  >
                    <span className="truncate text-[12px] text-fg">{m.title}</span>
                    <span className="shrink-0 rounded-md border border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {m.category}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {result.suggestedActions.length > 0 && (
              <p className="mt-2 text-[11px] text-dim">
                {result.suggestedActions.length} suggested action{result.suggestedActions.length === 1 ? "" : "s"} from your commitments — review them in{" "}
                <Link href="/actions" className="text-accent-2 hover:underline">
                  Commitments
                </Link>
                .
              </p>
            )}
            <div className="mt-4 flex items-center justify-between">
              <Btn variant="ghost" onClick={reset}>
                <Mic className="h-3.5 w-3.5" /> Capture another
              </Btn>
              <Link
                href="/brain"
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-accent-2 transition hover:bg-panel-3"
              >
                View in brain map →
              </Link>
            </div>
          </motion.div>
        )}

        {stage === "mic-error" && (
          <motion.div key="micerr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex flex-col items-center py-6 text-center">
              <CircleAlert className="h-8 w-8 text-rose-300" />
              <p className="mt-3 text-sm font-medium text-fg-strong">Microphone unavailable</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-dim">
                Check the browser address bar for the mic permission (icon near the URL) and make sure
                no other app is using the microphone. You can also type your memory instead.
              </p>
              <div className="mt-4 flex gap-2">
                <Btn variant="ghost" onClick={reset}>
                  Back
                </Btn>
                <Btn
                  variant="primary"
                  onClick={() => {
                    reset();
                    setShowTyped(true);
                  }}
                >
                  <Keyboard className="h-3.5 w-3.5" /> Type instead
                </Btn>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
