import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.hostname !== "www.the1vpn.ru") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.hostname = "the1vpn.ru";
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: "/:path*",
};
