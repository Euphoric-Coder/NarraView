import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, getAdminToken } from "@/config";

async function proxyRequest(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  let adminToken: string;
  try {
    adminToken = getAdminToken();
  } catch (err: any) {
    return NextResponse.json(
      {
        error:
          err.message ||
          "NarraView Studio configuration error: NARRAVIEW_ADMIN_TOKEN is missing from server environment.",
      },
      { status: 500 }
    );
  }

  const { path } = await context.params;
  const pathString = path ? path.join("/") : "";
  const url = new URL(req.url);
  const targetUrl = `${API_BASE_URL}/${pathString}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "host") {
      headers.set(key, value);
    }
  });
  headers.set("X-Admin-Token", adminToken);

  let body: ArrayBuffer | undefined = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const responseHeaders = new Headers();
    upstreamRes.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    const data = await upstreamRes.arrayBuffer();
    return new NextResponse(data, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error("[STUDIO_ADMIN_PROXY] Upstream fetch error:", err);
    return NextResponse.json(
      { error: "Failed to connect to NarraView backend API", details: err.message },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
