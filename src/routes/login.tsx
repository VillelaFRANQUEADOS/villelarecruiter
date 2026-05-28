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

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between p-16 border-r border-white/10">
          <div>
            <img
              src={logoSvg}
              alt="Villela Recruiter"
              className="w-[320px] max-w-full object-contain"
            />
          </div>

          <div className="space-y-6 max-w-xl">
            <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-1 text-sm text-cyan-200 backdrop-blur-sm">
              Recruiting Platform
            </div>

            <h1 className="text-5xl font-semibold leading-tight tracking-tight">
              Gestão inteligente de recrutamento operacional.
            </h1>

            <p className="text-lg text-white/70 leading-relaxed">
              Centralize candidatos, acompanhe pipelines e organize processos seletivos com velocidade, clareza e identidade profissional.
            </p>

            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <p className="text-3xl font-bold text-cyan-300">ATS</p>
                <p className="text-sm text-white/60 mt-1">Pipeline centralizado</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <p className="text-3xl font-bold text-cyan-300">IA</p>
                <p className="text-sm text-white/60 mt-1">Leitura automática</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <p className="text-3xl font-bold text-cyan-300">UFs</p>
                <p className="text-sm text-white/60 mt-1">Controle regional</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center p-6 lg:p-12">
          <Card className="w-full max-w-md border border-white/10 bg-white/10 backdrop-blur-xl shadow-2xl shadow-cyan-950/40">
            <div className="p-8">
              <div className="mb-8 text-center">
                <img
                  src={logoSvg}
                  alt="Villela Recruiter"
                  className="mx-auto mb-6 h-16 object-contain lg:hidden"
                />

                <h2 className="text-3xl font-semibold tracking-tight text-white">
                  Entrar na plataforma
                </h2>

                <p className="mt-2 text-sm text-white/60">
                  Acesse o ambiente de recrutamento Villela Recruiter.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="li-email" className="text-white/80">
                    E-mail
                  </Label>

                  <Input
                    id="li-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="li-pass" className="text-white/80">
                    Senha
                  </Label>

                  <Input
                    id="li-pass"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={busy}
                  className="h-11 w-full bg-[#4EC5E9] text-[#031F25] hover:bg-[#7dd8f1] font-semibold"
                >
                  {busy ? "Entrando..." : "Acessar plataforma"}
                </Button>

                <p className="pt-2 text-center text-xs text-white/45">
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
