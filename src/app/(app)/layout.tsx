import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { Topbar } from "@/components/shell/Topbar";
import { Toaster } from "@/components/ui/sonner";
import { AssistenteProvider } from "@/components/assistente/AssistenteDock";
import { requireAuth } from "@/lib/auth/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();

  return (
    <SidebarProvider>
      {/* O assistente mora AQUI, e não dentro de uma página, por dois motivos:
          como coluna irmã do conteúdo ele encolhe a página em vez de cobri-la
          (nada fica embaçado nem inerte), e por viver no layout ele sobrevive à
          navegação entre páginas em vez de desmontar e perder a conversa. */}
      <AssistenteProvider>
        <AppSidebar />
        <SidebarInset>
          <Topbar />
          <main className="flex-1 space-y-6 p-6">{children}</main>
        </SidebarInset>
      </AssistenteProvider>
      <Toaster />
    </SidebarProvider>
  );
}
