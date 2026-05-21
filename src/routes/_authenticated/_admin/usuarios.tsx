import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listUsers, createUser, updateUserRole, setUserActive,
  resetUserPassword, deleteUser,
} from "@/lib/admin-users.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { KeyRound, UserPlus, Trash2, Power } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_admin/usuarios")({
  component: UsuariosPage,
});

type Role = "admin" | "recrutador";

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", recrutador: "Recrutador" };

function UsuariosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const updRole = useServerFn(updateUserRole);
  const setActive = useServerFn(setUserActive);
  const resetPwd = useServerFn(resetUserPassword);
  const del = useServerFn(deleteUser);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const [newOpen, setNewOpen] = useState(false);
  const [pwdFor, setPwdFor] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await create({ data: {
        email: String(fd.get("email")),
        nome: String(fd.get("nome")),
        senha: String(fd.get("senha")),
        role: String(fd.get("role")) as Role,
      }});
      toast.success("Usuário criado");
      setNewOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function handleRoleChange(id: string, role: Role) {
    try {
      await updRole({ data: { userId: id, role } });
      toast.success("Papel atualizado");
      refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
  }

  async function handleToggle(id: string, ativo: boolean) {
    try {
      await setActive({ data: { userId: id, ativo } });
      toast.success(ativo ? "Usuário ativado" : "Usuário desativado");
      refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este usuário permanentemente?")) return;
    try {
      await del({ data: { userId: id } });
      toast.success("Excluído");
      refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
  }

  async function handleResetSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pwdFor) return;
    const fd = new FormData(e.currentTarget);
    try {
      await resetPwd({ data: { userId: pwdFor, novaSenha: String(fd.get("senha")) } });
      toast.success("Senha redefinida");
      setPwdFor(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1200px] mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-xs text-muted-foreground">{users.length} cadastrado(s)</p>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="size-4 mr-1.5" /> Novo usuário</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1.5"><Label>Nome</Label><Input name="nome" required /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input name="email" type="email" required /></div>
              <div className="space-y-1.5"><Label>Senha inicial</Label><Input name="senha" type="text" minLength={6} required /></div>
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select name="role" defaultValue="recrutador">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recrutador">Recrutador</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>Cancelar</Button>
                <Button type="submit">Criar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Nome</th>
                <th className="text-left px-3 py-2 font-medium">Email</th>
                <th className="text-left px-3 py-2 font-medium">Perfil</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === user?.id;
                return (
                  <tr key={u.id} className="border-t hover:bg-accent/20">
                    <td className="px-3 py-2 font-medium">{u.nome}{isSelf && <span className="text-xs text-muted-foreground ml-1">(você)</span>}</td>
                    <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                    <td className="px-3 py-2">
                      <Select value={u.role ?? "recrutador"} onValueChange={(v) => handleRoleChange(u.id, v as Role)} disabled={isSelf}>
                        <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recrutador">{ROLE_LABEL.recrutador}</SelectItem>
                          <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={u.ativo ? "bg-success/15 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30"}>
                        {u.ativo ? "Ativo" : "Desativado"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Redefinir senha" onClick={() => setPwdFor(u.id)}>
                          <KeyRound className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title={u.ativo ? "Desativar" : "Ativar"} disabled={isSelf} onClick={() => handleToggle(u.id, !u.ativo)}>
                          <Power className={`size-3.5 ${u.ativo ? "" : "text-muted-foreground"}`} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Excluir" disabled={isSelf} onClick={() => handleDelete(u.id)}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!users.length && !isLoading && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">Nenhum usuário.</td></tr>
              )}
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">Carregando...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!pwdFor} onOpenChange={(o) => !o && setPwdFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Redefinir senha</DialogTitle></DialogHeader>
          <form onSubmit={handleResetSubmit} className="space-y-3">
            <div className="space-y-1.5"><Label>Nova senha</Label><Input name="senha" type="text" minLength={6} required autoFocus /></div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setPwdFor(null)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
