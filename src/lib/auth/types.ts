export type Role = "pesquisa" | "revisao" | "aprovacao";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  expiresAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
