import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "./session";
import type { Role, AuthUser } from "./types";

const ROLE_HIERARCHY: Record<Role, number> = {
  pesquisa: 1,
  revisao: 2,
  aprovacao: 3,
};

export function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getSession();
  if (!session) return null;
  return {
    id: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
  };
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(minimumRole: Role): Promise<AuthUser> {
  const user = await requireAuth();
  if (!hasPermission(user.role, minimumRole)) {
    redirect("/acesso-negado");
  }
  return user;
}
