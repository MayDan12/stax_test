import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_BASE =
  process.env.NEXT_PUBLIC_STAX_API_URL ||
  "https://stax-automation.onrender.com/v1";

interface StaxRouteContext {
  params: Promise<{ path: string[] }>;
}

async function proxyRequest(req: NextRequest, ctx: StaxRouteContext) {
  const { path } = await ctx.params;
  const targetBase = (
    req.headers.get("x-stax-base-url") || DEFAULT_BACKEND_BASE
  ).replace(/\/+$/, "");

  const subPath = Array.isArray(path) ? path.join("/") : path;
  const search = req.nextUrl.search || "";
  const targetUrl = `${targetBase}/${subPath}${search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  } else {
    headers.set("content-type", "application/json");
  }

  const authorization = req.headers.get("authorization");
  if (authorization) {
    headers.set("authorization", authorization);
  }

  let body: string | undefined = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const text = await req.text();
      if (text) body = text;
    } catch {
      // ignore empty body
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });

    const responseText = await upstreamRes.text();
    let responseData: unknown = responseText;
    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch {
      // Keep as text if not JSON
    }

    if (typeof responseData === "object" && responseData !== null) {
      return NextResponse.json(responseData, { status: upstreamRes.status });
    }

    return new NextResponse(responseText, {
      status: upstreamRes.status,
      headers: {
        "content-type":
          upstreamRes.headers.get("content-type") || "application/json",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to reach Stax backend";
    return NextResponse.json(
      {
        statusCode: 502,
        error: "Bad Gateway (Backend Unreachable)",
        message: `Could not connect to Stax Backend at ${targetUrl}. Make sure the backend server is running. (${message})`,
      },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest, ctx: StaxRouteContext) {
  return proxyRequest(req, ctx);
}

export async function POST(req: NextRequest, ctx: StaxRouteContext) {
  return proxyRequest(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: StaxRouteContext) {
  return proxyRequest(req, ctx);
}

export async function PUT(req: NextRequest, ctx: StaxRouteContext) {
  return proxyRequest(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: StaxRouteContext) {
  return proxyRequest(req, ctx);
}
