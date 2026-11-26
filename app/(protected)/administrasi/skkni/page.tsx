import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SkkniClient } from "@/components/skkni/SkkniClient";

export default async function SkkniPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  return <SkkniClient userRole={session.user.role} />;
}
