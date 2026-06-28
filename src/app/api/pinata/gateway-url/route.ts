/**
 * GET /api/pinata/gateway-url?cid=<CID>
 * Generates a Pinata gateway URL for a given CID (server-side, includes gateway key if configured).
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("cid");
  if (!cid) {
    return NextResponse.json({ error: "cid parameter required" }, { status: 400 });
  }

  const gatewayDomain = process.env.NEXT_PUBLIC_PINATA_GATEWAY_DOMAIN;
  const gatewayKey = process.env.PINATA_GATEWAY_KEY;

  if (!gatewayDomain) {
    return NextResponse.json({
      error: "Gateway domain not configured",
      gatewayUrl: null,
    }, { status: 503 });
  }

  const protocol = gatewayDomain.startsWith("localhost") ? "http" : "https";
  const url = new URL(`${protocol}://${gatewayDomain}/ipfs/${cid}`);
  if (gatewayKey) {
    url.searchParams.set("pinataGatewayToken", gatewayKey);
  }

  return NextResponse.json({
    cid,
    gatewayUrl: url.toString(),
  });
}
