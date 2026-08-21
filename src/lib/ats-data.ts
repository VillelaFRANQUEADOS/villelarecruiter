import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Types e constantes permanecem no arquivo; correção estrutural aplicada somente
// na consulta de últimos status para eliminar o type-cast malformado.
