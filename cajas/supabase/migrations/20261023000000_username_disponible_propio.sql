-- Con sesión iniciada, el nombre que ya es tuyo cuenta como disponible (antes podía figurar "en uso" por uno mismo).
create or replace function public.username_disponible(p_u text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select v is not null
         and not exists (select 1 from public.profiles where username = v and id is distinct from auth.uid())
    from (select public._username_limpio(p_u) as v) s
$$;
