import { SidebarTrigger } from "@/components/ui/sidebar";
import { GlobalSearch } from "./GlobalSearch";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { getCurrentUser } from "@/lib/auth/rbac";

export async function Topbar() {
  const user = await getCurrentUser();

  return (
    <header className="flex h-14 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        {user && <UserMenu name={user.name} role={user.role} />}
      </div>
    </header>
  );
}
