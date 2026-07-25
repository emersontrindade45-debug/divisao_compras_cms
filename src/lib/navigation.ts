import {
  BarChart3,
  BookOpen,
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

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/**
 * Navegação agrupada por papel no fluxo de pesquisa de preços (IN 65/2021).
 *
 * A separação existe para deixar explícito que o trabalho diário começa em
 * OPERAÇÃO — os cadastros são bases de apoio consultadas entre processos, e
 * CONSULTA reúne o que se lê para instruir ou reaproveitar.
 *
 * "Guia de uso" não entra aqui de propósito: é ajuda, não destino de trabalho.
 * Vive no menu do usuário (ver `UserMenu`).
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Operação",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/processos", label: "Processos", icon: FolderSearch },
      { href: "/cotacoes", label: "Cotações", icon: Mail },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: "/fornecedores", label: "Fornecedores", icon: Building2 },
      { href: "/sites", label: "Sites admissíveis", icon: Globe },
    ],
  },
  {
    label: "Consulta",
    items: [
      { href: "/contratacoes", label: "Contratações públicas", icon: FileText },
      { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
] as const;

/** Lista plana de todos os destinos navegáveis, incluindo os fora da sidebar. */
export const NAV_ITEMS: readonly NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  { href: "/onboarding", label: "Guia de uso", icon: BookOpen },
];
