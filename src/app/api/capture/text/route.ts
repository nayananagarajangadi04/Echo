import { createMemoryFromTranscript } from "@/lib/ingest";
import { fail, handleApiError, ok, readJson } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await readJson<{ text?: string }>(req);
  const text = (body.text || "").trim();
  if (text.length < 10) {
    return fail("Write at least a sentence so there is something to remember.", 400);
  }
  try {
    const result = await createMemoryFromTranscript({
      transcript: text,
      source: "text",
      transcriptProvider: "typed",
    });
    return ok(result);
  } catch (err) {
    return handleApiError(err, "Capture failed");
  }
}
