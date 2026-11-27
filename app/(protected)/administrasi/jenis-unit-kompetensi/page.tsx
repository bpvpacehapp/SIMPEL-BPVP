import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUserAccessMenu } from "@/lib/rbac";
import { JenisUnitClient } from "@/components/jenis-unit/JenisUnitClient";

export default async function JenisUnitKompetensiPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const allowed = await canUserAccessMenu(
    session.user.id,
    session.user.role,
    "administrasi.jenis_unit"
  );
  if (!allowed) {
    redirect("/dashboard");
  }

  return <JenisUnitClient userRole={session.user.role} />;
}
