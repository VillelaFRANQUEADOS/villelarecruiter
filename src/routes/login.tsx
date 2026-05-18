import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          nome: String(fd.get("nome")),
          perfil: String(fd.get("perfil")),
        },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Conta criada! Verifique seu e-mail para ativar.");
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
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
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
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="su-nome">Nome</Label>
                  <Input id="su-nome" name="nome" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">E-mail</Label>
                  <Input id="su-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pass">Senha</Label>
                  <Input id="su-pass" name="password" type="password" required minLength={6} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-perfil">Perfil</Label>
                  <Select name="perfil" defaultValue="recrutador">
                    <SelectTrigger id="su-perfil"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recrutador">Recrutador</SelectItem>
                      <SelectItem value="agendamento">Agendamento</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Criando..." : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
