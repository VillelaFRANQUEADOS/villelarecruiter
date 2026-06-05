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

  const sortedUsers = [...users].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const [newOpen, setNewOpen] = useState(false);
  const [pwdFor, setPwdFor] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) { return; }
  async function handleRoleChange(id: string, role: Role) { return; }
  async function handleToggle(id: string, ativo: boolean) { return; }
  async function handleDelete(id: string) { return; }
  async function handleResetSubmit(e: React.FormEvent<HTMLFormElement>) { return; }

  return <div>{sortedUsers.map(u => <div key={u.id}>{(u.nome || '').toUpperCase()}</div>)}</div>
}