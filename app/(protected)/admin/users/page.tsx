import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { UserManagementClient } from "@/components/admin/UserManagementClient";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  return (
    <UserManagementClient
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    />
  );
}
