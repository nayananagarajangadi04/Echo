import { NextResponse } from "next/server";
import { UnauthorizedError } from "./supabase/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleApiError(err: unknown, fallback = "Request failed") {
  if (err instanceof UnauthorizedError) {
    return fail(err.message, 401);
  }
  const msg = err instanceof Error ? err.message : fallback;
  return fail(msg, 500);
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function searchParamsOf(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}
