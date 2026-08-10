import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, Shield, LogOut, Menu, BookOpen, Building2 } from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logoWhite from "@/assets/villela-logo-white.png";

const PLAYBOOK_URL = "https://canva.link/playbookvillelarecruiter";

const baseItems = [{ to: "/candidatos", label: "Candidatos", icon: Users }] as const;

const adminItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/usuarios", label: "Usuários", icon: Shield },
] as const;

// Unidades é somente consulta para usuários não-admin.
// As ações administrativas continuam protegidas dentro da própria página/backend.
const unitsItem = [{ to: "/unidades", label: "Unidades", icon: Building2 }] as const;

export function AppTopbar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { nome, role, signOut } = useAuth();
  const navigate = useNavigate();
  const items = [
    ...baseItems,
    ...(role === "admin" || role === "recrutador" ? adminItems : []),
    ...unitsItem,
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
      <div className="relative mx-auto flex h-14 max-w-7xl items-center gap-1.5 overflow-hidden rounded-2xl border border-white/60 bg-white/55 px-3 shadow-[0_8px_30px_rgba(11,34,57,0.12)] backdrop-blur-xl backdrop-saturate-150">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-white/90" />
        <div className="pointer-events-none absolute -top-10 left-10 h-20 w-56 rounded-full bg-white/40 blur-2xl" />

        <Link to="/candidatos" className="flex shrink-0 items-center gap-2.5 pr-1">
          <span className="grid size-9 place-items-center rounded-xl bg-brand shadow-sm">
            <img src={logoWhite} alt="Villela Recruiter" className="size-6 object-contain" />
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-sm font-semibold tracking-tight text-brand">Villela Recruiter</span>
            <span className="block text-[10px] text-muted-foreground">ATS · Recrutamento</span>
          </span>
        </Link>

        <nav className="mx-auto hidden items-center gap-1 md:flex">
          {items.map((it) => {
            const active = path.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-all ${
                  active
                    ? "bg-brand font-medium text-white shadow-sm"
                    : "text-foreground/70 hover:bg-brand/10 hover:text-brand"
                }`}
              >
                <it.icon className="size-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-1 md:flex">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-foreground/70 hover:bg-brand/10 hover:text-brand"
            onClick={() => window.open(PLAYBOOK_URL, "_blank")}
          >
            <BookOpen className="size-4 mr-1.5" />
            Playbook
          </Button>
          <div className="mx-1 h-6 w-px bg-brand/15" />
          <div className="px-1 text-right leading-tight">
            <p className="max-w-36 truncate text-xs font-medium text-brand">{nome ?? "Usuário"}</p>
            <p className="text-[10px] text-muted-foreground">{role ? ROLE_LABELS[role] : "—"}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full text-foreground/70 hover:bg-brand-danger/10 hover:text-brand-danger"
            onClick={() => void handleSignOut()}
            aria-label="Sair"
          >
            <LogOut className="size-4" />
          </Button>
        </div>

        <div className="ml-auto md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menu">
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <div className="px-2 py-1.5 leading-tight">
                <p className="truncate text-xs font-medium">{nome ?? "Usuário"}</p>
                <p className="text-[10px] text-muted-foreground">{role ? ROLE_LABELS[role] : "—"}</p>
              </div>
              <DropdownMenuSeparator />
              {items.map((it) => (
                <DropdownMenuItem key={it.to} asChild>
                  <Link to={it.to} className="flex items-center gap-2">
                    <it.icon className="size-4" />
                    {it.label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.open(PLAYBOOK_URL, "_blank")}>
                <BookOpen className="size-4 mr-2" /> Playbook
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleSignOut()} className="text-brand-danger">
                <LogOut className="size-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
