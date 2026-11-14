import { NextResponse } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = supabaseUrl();
  const publishableKey = supabasePublishableKey();

  let projectRef = "";
  try {
    const host = new URL(url).hostname;
    projectRef = host.endsWith(".supabase.co") ? host.split(".")[0] : "";
  } catch {
    projectRef = "";
  }

  return NextResponse.json(
    {
      url,
      publishableKey,
      projectRef,
      configured: Boolean(url && publishableKey),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
