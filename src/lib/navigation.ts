import {
  BarChart3,
  Building2,
  FileText,
  FolderSearch,
  Globe,
  LayoutDashboard,
  Mail,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/processos", label: "Processos", icon: FolderSearch },
  { href: "/contratacoes", label: "Contratações", icon: FileText },
  { href: "/sites", label: "Sites", icon: Globe },
  { href: "/fornecedores", label: "Fornecedores", icon: Building2 },
  { href: "/cotacoes", label: "Cotações", icon: Mail },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
] as const;
