import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canUserAccessAnyProglat } from "@/lib/rbac";

const ALLOWED_PDF_PREFIXES = [
  "https://proglat-assets.kemnaker.go.id/",
  "https://api.kemnaker.go.id/",
  "https://proglat.kemnaker.go.id/",
];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canUserAccessAnyProglat(
    session.user.id,
    session.user.role
  );
  if (!allowed) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const rawUrl = req.nextUrl.searchParams.get("url")?.trim() || "";
  if (
    !rawUrl ||
    !ALLOWED_PDF_PREFIXES.some((prefix) => rawUrl.startsWith(prefix))
  ) {
    return NextResponse.json(
      { message: "Tautan dokumen PDF tidak valid." },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(rawUrl, {
      method: "GET",
      headers: { Accept: "application/pdf,*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { message: `Gagal mengambil PDF (HTTP ${upstream.status}).` },
        { status: 502 }
      );
    }

    const buffer = await upstream.arrayBuffer();
    const isDownload = req.nextUrl.searchParams.get("download") === "1";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="program-pelatihan.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[API PROGLAT PREVIEW PDF] Error:", error);
    return NextResponse.json(
      { message: "Gagal memuat pratinjau dokumen PDF." },
      { status: 502 }
    );
  }
}
