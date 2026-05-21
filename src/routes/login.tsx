import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Briefcase } from "lucide-react";

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
      email: String(fd.get("email")), password: String(fd.get("password")),
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Bem-vindo!"); navigate({ to: "/dashboard" }); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-accent/30 to-background">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="size-11 rounded-xl bg-primary grid place-items-center text-primary-foreground">
            <Briefcase className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">RecrutaCRM</h1>
            <p className="text-xs text-muted-foreground">Gestão operacional de recrutamento</p>
          </div>
        </div>
        <Card className="p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="li-email">E-mail</Label>
              <Input id="li-email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="li-pass">Senha</Label>
              <Input id="li-pass" name="password" type="password" required autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Entrando..." : "Entrar"}
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Acesso restrito. Solicite credenciais a um administrador.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
