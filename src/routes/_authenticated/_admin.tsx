import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isUnitsPage = location.pathname === "/unidades";
  useEffect(() => {
    if (!loading && role !== "admin" && !isUnitsPage) navigate({ to: "/dashboard" });
  }, [role, loading, navigate, isUnitsPage]);
  if (loading || (role !== "admin" && !isUnitsPage)) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
  }
  return <Outlet />;
}
