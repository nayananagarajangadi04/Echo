import { transcribeOnly } from "@/lib/ingest";
import { fail, handleApiError, ok } from "@/lib/api";
import { getFlags } from "@/lib/env";
import { getStore } from "@/lib/store";

export const maxDuration = 60;

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
};

function resolveAudioMime(fileName: string, provided: string): string {
  const generic =
    !provided || provided === "application/octet-stream" || provided === "application/x-unknown";
  if (!generic) return provided;
  const ext = fileName.toLowerCase().split(".").pop() || "";
  return AUDIO_MIME_BY_EXT[ext] || "audio/wav";
}

export async function POST(req: Request) {
  try {
    await getStore();
  } catch (err) {
    return handleApiError(err, "Authentication required");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Expected multipart form data with an audio file.", 400);
  }
  const file = form.get("audio");
  if (!(file instanceof File)) {
    return fail("No audio provided.", 400);
  }
  const flags = getFlags();
  if (!flags.gemini) {
    return fail(
      "Server transcription requires GEMINI_API_KEY. In Chromium browsers, on-device speech recognition is used instead; otherwise you can type the transcript.",
      422,
      { code: "no_transcription_provider" }
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const { transcript, provider } = await transcribeOnly({
      audioBase64: buf.toString("base64"),
      mimeType: resolveAudioMime(file.name || "", file.type || ""),
    });
    return ok({ transcript, provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : "transcription_failed";
    return fail(
      message === "transcription_failed"
        ? "Transcription failed. You can review and type the transcript manually."
        : message,
      502,
      { code: message }
    );
  }
}
