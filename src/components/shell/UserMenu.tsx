"use client";

import Link from "next/link";
import { BookOpen, KeyRound, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/lib/actions/auth";

const ROLE_LABELS: Record<string, string> = {
  pesquisa: "Pesquisa",
  revisao: "Revisão",
  aprovacao: "Aprovação",
};

interface UserMenuProps {
  name: string;
  role: string;
}

export function UserMenu({ name, role }: UserMenuProps) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Menu do usuário"
          />
        }
      >
        <Avatar className="size-7">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* GroupLabel do Base UI só funciona dentro de um Group — solto, o menu quebra ao abrir
            (Base UI error #31). */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{name}</span>
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[role] ?? role}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/conta/senha" />}>
          <KeyRound className="mr-2 size-4" /> Alterar senha
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/onboarding" />}>
          <BookOpen className="mr-2 size-4" /> Guia de uso
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600 dark:text-red-400"
          onSelect={async () => {
            await logout();
          }}
        >
          <LogOut className="mr-2 size-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
