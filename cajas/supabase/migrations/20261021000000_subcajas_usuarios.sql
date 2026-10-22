-- Cajas dentro de cajas, nombres de usuario únicos, foto de perfil e invitaciones con aviso.

-- ───────────────────────── cajas dentro de cajas ─────────────────────────
-- Una caja "grande" puede contener cajitas (un solo nivel). Las cajitas usan la misma moneda y
-- los mismos miembros que la grande: los permisos se resuelven siempre contra la caja principal.
alter table public.cajas add column padre_id uuid references public.cajas(id) on delete cascade;
create index cajas_padre on public.cajas (padre_id) where padre_id is not null;

create function public._raiz(p_caja uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select padre_id from public.cajas where id = p_caja), p_caja)
$$;

create or replace function public.es_miembro(p_caja uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select true from public.caja_miembros
                    where caja_id = public._raiz(p_caja) and user_id = p_user and estado = 'activo'), false)
$$;
create or replace function public.puede_escribir(p_caja uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select true from public.caja_miembros
                    where caja_id = public._raiz(p_caja) and user_id = p_user and estado = 'activo' and rol in ('owner','editor')), false)
$$;
create or replace function public.es_owner(p_caja uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select true from public.caja_miembros
                    where caja_id = public._raiz(p_caja) and user_id = p_user and estado = 'activo' and rol = 'owner'), false)
$$;

-- "Compartida" se calcula sobre la caja principal y se propaga a sus cajitas.
create or replace function public._refrescar_tipo_caja() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_caja uuid := coalesce(new.caja_id, old.caja_id);
begin
  update public.cajas set tipo = case when (select count(*) from public.caja_miembros
                                             where caja_id = v_caja and estado = 'activo') > 1
                                      then 'compartida' else 'privada' end
   where id = v_caja or padre_id = v_caja;
  return null;
end $$;

create function public.crear_subcaja(p_padre uuid, p_nombre text, p_color text default null, p_meta bigint default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); pa public.cajas; v_id uuid;
begin
  select * into pa from public.cajas where id = p_padre;
  if not found or not public.puede_escribir(p_padre, v) then perform public._err('sin_permiso'); end if;
  if pa.padre_id is not null then perform public._err('subcaja_en_subcaja'); end if;
  if p_nombre is null or btrim(p_nombre) = '' or char_length(btrim(p_nombre)) > 60 then perform public._err('nombre_invalido'); end if;
  if p_meta is not null and p_meta <= 0 then perform public._err('meta_invalida'); end if;
  if (select count(*) from public.cajas where padre_id = p_padre) >= 30 then perform public._err('limite_subcajas'); end if;
  insert into public.cajas (nombre, color, moneda, tipo, meta_centavos, owner_id, padre_id)
    values (btrim(p_nombre), coalesce(p_color, pa.color), pa.moneda, pa.tipo, p_meta, pa.owner_id, p_padre)
    returning id into v_id;
  perform public._auditar(p_padre, 'crear_subcaja', jsonb_build_object('id', v_id, 'nombre', btrim(p_nombre)));
  return v_id;
end $$;

-- Saldos entre personas: se calculan sobre la caja principal y todas sus cajitas.
create or replace function public.saldos_caja(p_caja uuid)
returns table (user_id uuid, neto_centavos bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_raiz uuid := public._raiz(p_caja);
begin
  if not public.es_miembro(v_raiz, auth.uid()) then perform public._err('sin_permiso'); end if;
  return query
    select x.u, sum(x.v)::bigint from (
      select t.pagada_por as u, t.monto_centavos as v from public.transacciones t
       where t.caja_id in (select c.id from public.cajas c where c.id = v_raiz or c.padre_id = v_raiz)
         and t.tipo in ('gasto','transferencia')
      union all
      select d.user_id, -d.monto_centavos from public.divisiones d
        join public.transacciones t on t.id = d.transaccion_id
       where t.caja_id in (select c.id from public.cajas c where c.id = v_raiz or c.padre_id = v_raiz)
         and t.tipo in ('gasto','transferencia')
      union all
      select m.user_id, 0::bigint from public.caja_miembros m where m.caja_id = v_raiz and m.estado = 'activo'
    ) x group by x.u;
end $$;

-- Vista con fondos propios, miembros (los de la caja principal) y total de la caja con sus cajitas.
create or replace view public.cajas_resumen with (security_invoker = true) as
select c.id, c.nombre, c.color, c.moneda, c.tipo, c.meta_centavos, c.owner_id, c.archivada, c.created_at,
       own.f as fondos_centavos,
       (select count(*) from public.caja_miembros m where m.caja_id = coalesce(c.padre_id, c.id) and m.estado = 'activo')::int as miembros,
       c.padre_id,
       (select count(*) from public.cajas h where h.padre_id = c.id)::int as subcajas,
       (own.f + coalesce((select sum(case when t.tipo in ('ingreso','traspaso_ent') then t.monto_centavos
                                          when t.tipo in ('gasto','traspaso_sal') then -t.monto_centavos else 0 end)
                            from public.cajas h join public.transacciones t on t.caja_id = h.id
                           where h.padre_id = c.id), 0))::bigint as fondos_total_centavos
  from public.cajas c
 cross join lateral (
   select coalesce(sum(case when t.tipo in ('ingreso','traspaso_ent') then t.monto_centavos
                            when t.tipo in ('gasto','traspaso_sal') then -t.monto_centavos else 0 end), 0)::bigint as f
     from public.transacciones t where t.caja_id = c.id) own;

-- ───────────────────────── nombres de usuario y foto ─────────────────────────
alter table public.profiles add column username text, add column avatar_url text;
alter table public.profiles add constraint profiles_username_formato check (username is null or username ~ '^[a-z0-9_]{3,20}$');
alter table public.profiles add constraint profiles_avatar_propio
  check (avatar_url is null or (avatar_url ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$' and avatar_url like id::text || '/%'));
create unique index profiles_username_key on public.profiles (username);

-- Devuelve el nombre de usuario normalizado (minúsculas, sin @) o null si no es válido o está reservado.
create function public._username_limpio(p_u text) returns text language sql immutable as $$
  select case when v ~ '^[a-z0-9_]{3,20}$'
               and v not in ('admin','administrador','soporte','support','cajas','root','sistema','ayuda','moderador')
              then v end
    from (select lower(regexp_replace(btrim(coalesce(p_u, '')), '^@', '')) as v) s
$$;

-- Se puede consultar antes de tener sesión (al crear la cuenta). Solo dice si el nombre está libre.
create function public.username_disponible(p_u text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select v is not null and not exists (select 1 from public.profiles where username = v)
    from (select public._username_limpio(p_u) as v) s
$$;

create function public.definir_username(p_u text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); n text := public._username_limpio(p_u);
begin
  if n is null then perform public._err('username_invalido'); end if;
  begin
    update public.profiles set username = n where id = v;
  exception when unique_violation then perform public._err('username_en_uso');
  end;
  return n;
end $$;

-- Búsqueda para invitar: solo por prefijo, mínimo 3 letras, máximo 6 resultados, sin incluirse a uno mismo.
create function public.buscar_usuarios(p_q text)
returns table (id uuid, username text, nombre text, avatar_url text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); q text := lower(regexp_replace(btrim(coalesce(p_q, '')), '^@', ''));
begin
  if q !~ '^[a-z0-9_]{3,20}$' then return; end if;
  return query
    select p.id, p.username, p.nombre, p.avatar_url from public.profiles p
     where p.username is not null and p.id <> v
       and p.username like replace(q, '_', '\_') || '%'
     order by (p.username = q) desc, p.username limit 6;
end $$;

-- El alta toma el nombre de usuario del formulario si es válido y está libre; si no, la persona lo elige al entrar.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_nombre text := coalesce(nullif(btrim(new.raw_user_meta_data->>'nombre'), ''), split_part(new.email, '@', 1));
        v_u text := public._username_limpio(new.raw_user_meta_data->>'username');
begin
  begin
    insert into public.profiles (id, nombre, email, username) values (new.id, v_nombre, lower(new.email), v_u);
  exception when unique_violation then
    insert into public.profiles (id, nombre, email, username) values (new.id, v_nombre, lower(new.email), null);
  end;
  perform public._crear_caja(new.id, 'Mis gastos', '#2A43E6', 'ARS', null);
  return new;
end $$;

-- ───────────────────────── invitaciones dentro de la app ─────────────────────────
alter table public.invitaciones add column avisada_en timestamptz;

drop function public.invitar_a_caja(uuid, text, text);
create function public.invitar_a_caja(p_caja uuid, p_usuario text, p_rol text default 'editor')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); v_inv uuid; v_dest public.profiles; v_caja public.cajas; v_yo public.profiles;
begin
  if not public.es_owner(p_caja, v) then perform public._err('sin_permiso'); end if;
  if exists (select 1 from public.cajas where id = p_caja and padre_id is not null) then perform public._err('caja_principal_requerida'); end if;
  if p_rol not in ('editor','viewer') then perform public._err('rol_invalido'); end if;
  select * into v_dest from public.profiles where username = public._username_limpio(p_usuario);
  if not found then perform public._err('usuario_no_encontrado'); end if;
  if v_dest.id = v then perform public._err('es_tu_cuenta'); end if;
  if public.es_miembro(p_caja, v_dest.id) then perform public._err('ya_es_miembro'); end if;
  if exists (select 1 from public.invitaciones where caja_id = p_caja and invitado_id = v_dest.id and estado = 'pendiente' and expira_en > now())
    then perform public._err('invitacion_pendiente'); end if;
  update public.invitaciones set estado = 'expirada'
   where caja_id = p_caja and invitado_id = v_dest.id and estado = 'pendiente' and expira_en <= now();
  select * into v_caja from public.cajas where id = p_caja;
  select * into v_yo from public.profiles where id = v;
  insert into public.invitaciones (caja_id, invitado_id, invitado_por, rol)
    values (p_caja, v_dest.id, v, p_rol) returning id into v_inv;
  perform public._avisar(v_dest.id, 'invitacion', '@' || coalesce(v_yo.username, v_yo.nombre) || ' te invitó a la caja “' || v_caja.nombre || '”.',
    jsonb_build_object('invitacion_id', v_inv, 'caja_nombre', v_caja.nombre, 'por_nombre', v_yo.nombre));
  perform public._auditar(p_caja, 'invitar', jsonb_build_object('invitado', v_dest.id, 'rol', p_rol));
  return v_inv;
end $$;

-- Lo único que ve el invitado antes de aceptar: nombre de la caja y quién lo invita (con su foto).
drop function public.mis_invitaciones();
create function public.mis_invitaciones()
returns table (id uuid, caja_nombre text, por_nombre text, por_username text, por_avatar text, rol text, creada timestamptz, nueva boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.id, c.nombre, p.nombre, p.username, p.avatar_url, i.rol, i.created_at, (i.avisada_en is null)
    from public.invitaciones i
    join public.cajas c on c.id = i.caja_id
    join public.profiles p on p.id = i.invitado_por
   where i.invitado_id = auth.uid() and i.estado = 'pendiente' and i.expira_en > now()
   order by i.created_at desc
$$;

-- Se llama cuando la app ya le mostró el cartelito: así avisa una sola vez por invitación, en cualquier dispositivo.
create function public.marcar_invitaciones_vistas() returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.invitaciones set avisada_en = now()
   where invitado_id = auth.uid() and estado = 'pendiente' and avisada_en is null
$$;

-- Invitaciones pendientes de una caja, para su dueño (con la foto de cada invitado).
create function public.invitaciones_de_caja(p_caja uuid)
returns table (id uuid, user_id uuid, username text, nombre text, avatar_url text, rol text, creada timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.es_owner(p_caja, public._uid()) then perform public._err('sin_permiso'); end if;
  return query
    select i.id, p.id, p.username, p.nombre, p.avatar_url, i.rol, i.created_at
      from public.invitaciones i join public.profiles p on p.id = i.invitado_id
     where i.caja_id = p_caja and i.estado = 'pendiente' and i.expira_en > now()
     order by i.created_at desc;
end $$;

-- ───────────────────────── fotos de perfil (Supabase Storage) ─────────────────────────
-- Bucket público de lectura; cada persona solo escribe dentro de su carpeta (<id>/...). Máx. 512 KB.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('avatars', 'avatars', true, 524288, array['image/jpeg','image/png','image/webp'])
      on conflict (id) do update set public = true, file_size_limit = 524288, allowed_mime_types = excluded.allowed_mime_types;
    execute $p$ create policy avatars_select_propio on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text) $p$;
    execute $p$ create policy avatars_insert_propio on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text) $p$;
    execute $p$ create policy avatars_delete_propio on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text) $p$;
  end if;
end $$;

-- ───────────────────────── permisos de lo nuevo ─────────────────────────
revoke all on function public._raiz(uuid), public._username_limpio(text), public.crear_subcaja(uuid, text, text, bigint),
  public.username_disponible(text), public.definir_username(text), public.buscar_usuarios(text),
  public.invitar_a_caja(uuid, text, text), public.mis_invitaciones(), public.marcar_invitaciones_vistas(),
  public.invitaciones_de_caja(uuid) from public, anon, authenticated;

grant update (avatar_url) on public.profiles to authenticated;
grant execute on function public.crear_subcaja(uuid, text, text, bigint), public.definir_username(text),
  public.buscar_usuarios(text), public.invitar_a_caja(uuid, text, text), public.mis_invitaciones(),
  public.marcar_invitaciones_vistas(), public.invitaciones_de_caja(uuid), public.username_disponible(text) to authenticated;
grant execute on function public.username_disponible(text) to anon;
