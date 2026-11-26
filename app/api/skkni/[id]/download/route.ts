import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessMenu } from "@/lib/rbac";

const SKKNI_DOWNLOAD_BASE =
  "https://skkni-api.kemnaker.go.id/v1/public/documents";

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "dokumen-skkni.pdf";
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const allowed = await canUserAccessMenu(
    session.user.id,
    session.user.role,
    "administrasi.skkni"
  );
  if (!allowed) {
    return NextResponse.json(
      { message: "Anda tidak memiliki izin mengunduh dokumen SKKNI." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { message: "ID dokumen tidak valid." },
      { status: 400 }
    );
  }

  try {
    const localDoc = await prisma.skkniDocument.findUnique({
      where: { id },
      select: { fileName: true, numberKepmen: true },
    });

    const upstreamUrl = `${SKKNI_DOWNLOAD_BASE}/${encodeURIComponent(id)}/download`;
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        {
          message: `File PDF dokumen SKKNI tidak tersedia di server Kemnaker (HTTP ${upstream.status}).`,
        },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "application/pdf";
    const fallbackName = localDoc?.fileName
      ? localDoc.fileName
      : localDoc?.numberKepmen
        ? `SKKNI ${localDoc.numberKepmen}.pdf`
        : `SKKNI-${id}.pdf`;
    const safeFilename = sanitizeFilename(
      fallbackName.toLowerCase().endsWith(".pdf")
        ? fallbackName
        : `${fallbackName}.pdf`
    );

    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[API SKKNI DOWNLOAD] Error:", error);
    return NextResponse.json(
      { message: "Gagal mengunduh file PDF dari server SKKNI Kemnaker." },
      { status: 502 }
    );
  }
}
