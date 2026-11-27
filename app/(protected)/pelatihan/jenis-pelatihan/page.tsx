import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUserAccessMenu } from "@/lib/rbac";
import { JenisPelatihanClient } from "@/components/pelatihan/JenisPelatihanClient";

export default async function JenisPelatihanPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const allowed = await canUserAccessMenu(
    session.user.id,
    session.user.role,
    "pelatihan.jenis_pelatihan"
  );
  if (!allowed) {
    redirect("/dashboard");
  }

  return <JenisPelatihanClient userRole={session.user.role} />;
}
