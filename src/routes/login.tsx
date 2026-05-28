import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import logoSvg from "@/assets/villela-recruiter-logo.svg";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);

    const fd = new FormData(e.currentTarget);

    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });

    setBusy(false);

    if (error) toast.error(error.message);
    else {
      toast.success("Bem-vindo ao Villela Recruiter");
      navigate({ to: "/dashboard" });
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#031F25] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#4EC5E920,transparent_30%),radial-gradient(circle_at_bottom_left,#0B4A5B60,transparent_40%)]" />

      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#4EC5E9]/10 blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl animate-pulse" />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden lg:flex flex-col justify-center px-16 xl:px-24 border-r border-white/5">
          <div className="max-w-2xl">
            <div className="mb-10 flex items-center gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-400/20 bg-cyan-400/10 backdrop-blur-md">
                <img
                  src={logoSvg}
                  alt="Villela Recruiter"
                  className="h-10 w-10 object-contain"
                />
              </div>

              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">
                  Villela Recruiter
                </p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
                  Recruiting Platform
                </h1>
              </div>
            </div>

            <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-1 text-sm text-cyan-200 backdrop-blur-sm">
              Plataforma ATS corporativa
            </div>

            <h2 className="mt-8 text-6xl font-semibold leading-[1.05] tracking-tight text-white">
              Gestão inteligente de recrutamento operacional.
            </h2>

            <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/65">
              Centralize candidatos, acompanhe processos seletivos e gerencie equipes de recrutamento com uma experiência moderna, rápida e organizada.
            </p>

            <div className="mt-12 grid grid-cols-3 gap-5">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition hover:-translate-y-1 hover:bg-white/10">
                <p className="text-3xl font-bold text-cyan-300">ATS</p>
                <p className="mt-2 text-sm text-white/55">
                  Pipeline centralizado
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition hover:-translate-y-1 hover:bg-white/10">
                <p className="text-3xl font-bold text-cyan-300">IA</p>
                <p className="mt-2 text-sm text-white/55">
                  Leitura automática
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition hover:-translate-y-1 hover:bg-white/10">
                <p className="text-3xl font-bold text-cyan-300">UFs</p>
                <p className="mt-2 text-sm text-white/55">
                  Controle regional
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center p-6 lg:p-12">
          <Card className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/10 backdrop-blur-2xl shadow-2xl shadow-cyan-950/40">
            <div className="p-8 lg:p-10">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-400/20 bg-cyan-400/10 backdrop-blur-md lg:hidden">
                  <img
                    src={logoSvg}
                    alt="Villela Recruiter"
                    className="h-10 w-10 object-contain"
                  />
                </div>

                <h2 className="text-3xl font-semibold tracking-tight text-white">
                  Entrar na plataforma
                </h2>

                <p className="mt-3 text-sm leading-relaxed text-white/55">
                  Acesse o ambiente corporativo Villela Recruiter.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="li-email" className="text-white/75">
                    E-mail
                  </Label>

                  <Input
                    id="li-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="h-12 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-cyan-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="li-pass" className="text-white/75">
                    Senha
                  </Label>

                  <Input
                    id="li-pass"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="h-12 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-cyan-400"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={busy}
                  className="h-12 w-full rounded-xl bg-[#4EC5E9] font-semibold text-[#031F25] transition hover:scale-[1.01] hover:bg-[#7dd8f1]"
                >
                  {busy ? "Entrando..." : "Acessar plataforma"}
                </Button>

                <p className="pt-2 text-center text-xs leading-relaxed text-white/40">
                  Ambiente corporativo restrito. Solicite acesso ao administrador.
                </p>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
