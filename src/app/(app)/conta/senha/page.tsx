import { PageHeader } from "@/components/common/PageHeader";
import { AlterarSenhaForm } from "@/components/conta/AlterarSenhaForm";
import { requireAuth } from "@/lib/auth/rbac";

export const metadata = { title: "Alterar senha — Pesquisa de Preços / CMS" };

export default async function AlterarSenhaPage() {
  const user = await requireAuth();

  return (
    <div className="space-y-6">
      <PageHeader title="Alterar senha" description={`Conta: ${user.email}`} />
      <AlterarSenhaForm />
    </div>
  );
}
