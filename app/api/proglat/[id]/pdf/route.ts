import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessAnyProglat } from "@/lib/rbac";

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "program.pdf";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const program = await prisma.proglatProgram.findUnique({
    where: { id },
    select: { title: true, code: true, downloadMaterialUri: true },
  });

  if (!program?.downloadMaterialUri) {
    return NextResponse.json(
      { message: "Dokumen PDF program pelatihan tidak tersedia." },
      { status: 404 }
    );
  }

  try {
    const upstream = await fetch(program.downloadMaterialUri, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        {
          message: `Gagal memuat file PDF dari Proglat Kemnaker (HTTP ${upstream.status}).`,
        },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const isDownload = req.nextUrl.searchParams.get("download") === "1";
    const filename = sanitizeFilename(
      `Proglat-${program.code || program.title}.pdf`
    );
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[API PROGLAT PDF] Error:", error);
    return NextResponse.json(
      { message: "Gagal memuat preview PDF dari server Proglat Kemnaker." },
      { status: 502 }
    );
  }
}
