import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSnapshotDocumentById } from "@/lib/skkni";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { message: "ID dokumen tidak valid." },
      { status: 400 }
    );
  }

  // 1. Cek snapshot server dulu (instan, 0 ms)
  const snapDoc = getSnapshotDocumentById(id);
  if (snapDoc) {
    return NextResponse.json({
      success: true,
      data: snapDoc.units,
    });
  }

  // 2. Fallback ke DB lokal jika sudah tersimpan
  const localUnits = await prisma.skkniUnit.findMany({
    where: { documentId: id },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      title: true,
      titleEn: true,
      availability: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: localUnits,
  });
}
