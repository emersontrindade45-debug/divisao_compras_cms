import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

export function Topbar() {
  return (
    <header className="flex h-14 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <div className="relative max-w-md flex-1">
        <Search
          className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input placeholder="Buscar (em breve)" disabled className="pl-8" />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
