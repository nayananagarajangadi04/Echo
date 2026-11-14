import { createMemoryFromTranscript } from "@/lib/ingest";
import { fail, handleApiError, ok, readJson } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await readJson<{
    transcript?: string;
    source?: "voice" | "text";
    durationSec?: number;
  }>(req);
  const transcript = (body.transcript || "").trim();
  if (transcript.length < 3) {
    return fail("A transcript is required — ECHO stores exactly what you said.", 400);
  }
  const source = body.source === "voice" ? "voice" : "text";
  try {
    const result = await createMemoryFromTranscript({
      transcript,
      source,
      durationSec: body.durationSec,
      transcriptProvider: source === "voice" ? "user-verified" : "typed",
    });
    return ok(result);
  } catch (err) {
    return handleApiError(err, "Capture failed");
  }
}
