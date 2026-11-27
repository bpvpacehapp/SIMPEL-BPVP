import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessMenu } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const [canProglat, canSkkni] = await Promise.all([
    canUserAccessMenu(session.user.id, session.user.role, "administrasi.proglat"),
    canUserAccessMenu(session.user.id, session.user.role, "administrasi.skkni"),
  ]);
  if (!canProglat && !canSkkni) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";

  const units = await prisma.skkniUnit.findMany({
    where: q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ code: "asc" }, { title: "asc" }],
    take: 15,
    select: {
      id: true,
      code: true,
      title: true,
      documentId: true,
      document: {
        select: {
          id: true,
          numberKepmen: true,
          sector: true,
          availability: true,
        },
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: units.map((u) => ({
      id: u.id,
      code: u.code,
      title: u.title,
      skkniId: u.documentId,
      skkni: u.document,
    })),
  });
}
