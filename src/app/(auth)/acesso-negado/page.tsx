import Link from "next/link";

export const metadata = { title: "Acesso Negado — Pesquisa de Preços / CMS" };

export default function AcessoNegadoPage() {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Acesso negado
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Você não tem permissão para acessar esta página.
        <br />
        Entre em contato com o administrador se achar que isso é um engano.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
      >
        Voltar ao painel
      </Link>
    </div>
  );
}
