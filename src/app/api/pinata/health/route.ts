/**
 * GET /api/pinata/health
 * Checks if Pinata credentials are configured (without exposing them).
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hasJwt = !!process.env.PINATA_JWT;
  const hasApiKey = !!process.env.PINATA_API_KEY;
  const hasApiSecret = !!process.env.PINATA_API_SECRET;
  const hasGateway = !!process.env.NEXT_PUBLIC_PINATA_GATEWAY_DOMAIN;
  const hasGatewayKey = !!process.env.PINATA_GATEWAY_KEY;

  // JWT is preferred. API key + secret also works.
  const canUpload = hasJwt || (hasApiKey && hasApiSecret);
  const canGateway = hasGateway;

  return NextResponse.json({
    configured: canUpload,
    canUpload,
    canGateway,
    uploadMethod: hasJwt ? "jwt" : hasApiKey && hasApiSecret ? "apikey" : "none",
    gatewayDomain: process.env.NEXT_PUBLIC_PINATA_GATEWAY_DOMAIN ?? null,
    hasGatewayKey,
    message: !canUpload
      ? "Pinata not configured. Set PINATA_JWT or PINATA_API_KEY + PINATA_API_SECRET in .env"
      : !canGateway
        ? "Pinata upload configured but gateway domain missing. Set NEXT_PUBLIC_PINATA_GATEWAY_DOMAIN."
        : "Pinata fully configured.",
  });
}
