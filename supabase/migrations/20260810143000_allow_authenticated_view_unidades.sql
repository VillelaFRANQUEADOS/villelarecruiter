create policy "Authenticated users can view units"
on public.unidades
for select
to authenticated
using (true);
