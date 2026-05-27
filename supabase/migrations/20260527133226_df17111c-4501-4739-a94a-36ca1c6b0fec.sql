
-- ============ candidatos: restrict SELECT to staff roles ============
DROP POLICY IF EXISTS "candidatos viewable by authenticated" ON public.candidatos;
CREATE POLICY "staff view candidatos"
  ON public.candidatos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'recrutador')
    OR public.has_role(auth.uid(), 'agendamento')
  );

-- ============ profiles: restrict SELECT ============
DROP POLICY IF EXISTS "profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "users view own profile or staff view team"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'recrutador')
    OR public.has_role(auth.uid(), 'agendamento')
  );

-- ============ user_roles: restrict SELECT to owner or admin ============
DROP POLICY IF EXISTS "user_roles viewable by authenticated" ON public.user_roles;
CREATE POLICY "users view own role or admin views all"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- ============ storage.objects: scope curriculos bucket to staff ============
DROP POLICY IF EXISTS "auth read curriculos" ON storage.objects;
DROP POLICY IF EXISTS "auth update curriculos" ON storage.objects;
DROP POLICY IF EXISTS "auth upload curriculos" ON storage.objects;
DROP POLICY IF EXISTS "auth delete curriculos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can read curriculos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can update curriculos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can upload curriculos" ON storage.objects;
DROP POLICY IF EXISTS "admins can delete curriculos" ON storage.objects;

CREATE POLICY "staff read curriculos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'curriculos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'recrutador')
      OR public.has_role(auth.uid(), 'agendamento')
    )
  );

CREATE POLICY "staff upload curriculos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'curriculos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'recrutador')
      OR public.has_role(auth.uid(), 'agendamento')
    )
  );

CREATE POLICY "staff update curriculos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'curriculos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'recrutador')
      OR public.has_role(auth.uid(), 'agendamento')
    )
  );

CREATE POLICY "admins delete curriculos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'curriculos'
    AND public.has_role(auth.uid(), 'admin')
  );
