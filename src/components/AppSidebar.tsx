import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, Kanban, CalendarClock, LogOut, Briefcase } from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/candidatos", label: "Candidatos", icon: Users },
  { to: "/pipeline", label: "Pipeline", icon: Kanban },
  { to: "/agendamento", label: "Agendamento", icon: CalendarClock },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { nome, role, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="px-5 py-5 flex items-center gap-3 border-b border-sidebar-border">
        <div className="size-9 rounded-lg bg-primary grid place-items-center text-primary-foreground">
          <Briefcase className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">RecrutaCRM</p>
          <p className="text-[11px] text-sidebar-foreground/60 mt-1">Operacional</p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map((it) => {
          const active = path.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
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

      <div className="p-3 border-t border-sidebar-border">
        <div className="px-3 py-2 mb-2">
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
