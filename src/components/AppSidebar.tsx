import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, Kanban, LogOut, Shield } from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import logoWhite from "@/assets/villela-logo-white.png";

const baseItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/candidatos", label: "Candidatos", icon: Users },
  { to: "/pipeline", label: "Pipeline", icon: Kanban },
] as const;

const adminItems = [
  { to: "/usuarios", label: "Usuários", icon: Shield },
] as const;


export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { nome, role, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="px-4 py-4 flex items-center gap-3 border-b border-sidebar-border">
        <img src={logoWhite} alt="Grupo Villela" className="size-9 object-contain" />
        <div>
          <p className="text-sm font-semibold leading-none tracking-tight">Grupo Villela</p>
          <p className="text-[11px] text-sidebar-foreground/60 mt-1">ATS · Recrutamento</p>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {[...baseItems, ...(role === "admin" ? adminItems : [])].map((it) => {
          const active = path.startsWith(it.to);

          return (
            <Link
              key={it.to}
              to={it.to}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <it.icon className="size-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-sidebar-border">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-medium truncate">{nome ?? "Usuário"}</p>
          <p className="text-[11px] text-sidebar-foreground/60">{role ? ROLE_LABELS[role] : "—"}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
        >
          <LogOut className="size-4 mr-2" /> Sair
        </Button>
      </div>
    </aside>
  );
}
