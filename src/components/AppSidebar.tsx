import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, LogOut, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import logoWhite from "@/assets/villela-logo-white.png";

const baseItems = [
  { to: "/candidatos", label: "Candidatos", icon: Users },
] as const;

const adminItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/usuarios", label: "Usuários", icon: Shield },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { nome, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`sticky top-0 hidden h-screen md:flex shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 z-40 ${
        collapsed ? "w-20" : "w-56"
      }`}
    >
      <div className="relative px-4 py-4 border-b border-sidebar-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-5 top-6 z-50 flex h-9 w-9 items-center justify-center rounded-full border-2 border-cyan-400/40 bg-[#062B33] text-white shadow-lg shadow-cyan-950/40 transition hover:scale-105 hover:bg-[#0A3B46]"
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>

        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <img
            src={logoWhite}
            alt="Villela Recruiter"
            className="size-9 object-contain shrink-0"
          />

          {!collapsed && (
            <div>
              <p className="text-sm font-semibold leading-none tracking-tight">
                Villela Recruiter
              </p>
              <p className="text-[11px] text-sidebar-foreground/60 mt-1">
                ATS · Recrutamento
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {[...baseItems, ...(role === "admin" ? adminItems : [])].map((it) => {
          const active = path.startsWith(it.to);

          return (
            <Link
              key={it.to}
              to={it.to}
              title={collapsed ? it.label : undefined}
              className={`flex items-center rounded-md px-3 py-2 text-sm transition-all duration-200 ${
                collapsed ? "justify-center" : "gap-3"
              } ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <it.icon className="size-4 shrink-0" />
              {!collapsed && it.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-sidebar-border">
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium truncate">{nome ?? "Usuário"}</p>
            <p className="text-[11px] text-sidebar-foreground/60">
              {role ? ROLE_LABELS[role] : "—"}
            </p>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className={`w-full text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground ${
            collapsed ? "justify-center" : "justify-start"
          }`}
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
        >
          <LogOut className={`size-4 ${collapsed ? "" : "mr-2"}`} />
          {!collapsed && "Sair"}
        </Button>
      </div>
    </aside>
  );
}
