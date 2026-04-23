import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: string, status = 400, message?: string) {
  return NextResponse.json(
    {
      ok: false,
      error,
      message,
    },
    { status },
  );
}
