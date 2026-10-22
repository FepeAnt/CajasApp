-- Cajas · esquema inicial
-- Principios:
--  1. Nadie accede a una caja sin ser miembro activo (RLS en todas las tablas).
--  2. Las escrituras pasan por funciones (RPC) que validan permisos e invariantes
--     (p. ej. que las divisiones sumen el total). Los roles de la API no escriben tablas directamente.
--  3. Dinero siempre en centavos enteros (bigint), en la moneda de la caja.

-- ───────────────────────── catálogos ─────────────────────────
create table public.monedas (
  codigo   text primary key check (codigo ~ '^[A-Z]{3}$'),
  nombre   text not null,
  simbolo  text not null,
  decimales smallint not null default 2
);
insert into public.monedas values
  ('ARS','Peso argentino','$',0), ('USD','Dólar estadounidense','US$',2), ('EUR','Euro','€',2),
  ('BRL','Real brasileño','R$',2), ('UYU','Peso uruguayo','$U',0), ('CLP','Peso chileno','CLP$',0);

-- Cotización de referencia: unidades de cada moneda por 1 US$. Solo la actualiza el servidor.
create table public.tipos_cambio (
  moneda text primary key references public.monedas(codigo),
  por_usd numeric(18,6) not null check (por_usd > 0),
  actualizado_en timestamptz not null default now()
);
insert into public.tipos_cambio (moneda, por_usd) values
  ('USD',1), ('ARS',1450), ('EUR',0.92), ('BRL',5.4), ('UYU',40), ('CLP',950);

create table public.categorias (
  nombre text primary key,
  color  text not null,
  fija   boolean not null default false   -- gasto fijo (se usa en la proyección)
);
insert into public.categorias (nombre, color, fija) values
  ('Supermercado','#2F9E6B',false), ('Comida afuera','#E0662F',false), ('Transporte','#3B82C4',false),
  ('Combustible','#8A6E3B',false), ('Servicios','#C79A1B',true), ('Alquiler','#6D5BD0',true),
  ('Suscripciones','#C23B8A',true), ('Salud','#D6455D',false), ('Ocio','#12A5A5',false),
  ('Compras','#9B5DE5',false), ('Mantenimiento','#7A8599',false), ('Viajes','#2A9DD8',false),
  ('Ingresos','#0B7F58',false), ('Otros','#8B93A3',false);

-- ───────────────────────── usuarios ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  email text not null,
  moneda_base text not null default 'ARS' references public.monedas(codigo),
  created_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

-- Cotización propia de cada usuario (pisa a la de referencia)
create table public.tipos_cambio_usuario (
  user_id uuid not null references public.profiles(id) on delete cascade,
  moneda text not null references public.monedas(codigo),
  por_usd numeric(18,6) not null check (por_usd > 0),
  primary key (user_id, moneda)
);

-- ───────────────────────── cajas ─────────────────────────
create table public.cajas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  color text not null default '#2A43E6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  moneda text not null references public.monedas(codigo),
  tipo text not null default 'privada' check (tipo in ('privada','compartida')),
  meta_centavos bigint check (meta_centavos is null or meta_centavos > 0),
  owner_id uuid not null references public.profiles(id),
  archivada boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.caja_miembros (
  caja_id uuid not null references public.cajas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rol text not null check (rol in ('owner','editor','viewer')),
  estado text not null default 'activo' check (estado in ('activo','removido')),
  created_at timestamptz not null default now(),
  primary key (caja_id, user_id)
);
create unique index caja_un_owner on public.caja_miembros (caja_id) where rol = 'owner' and estado = 'activo';
create index caja_miembros_user on public.caja_miembros (user_id) where estado = 'activo';

create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.cajas(id) on delete cascade,
  invitado_id uuid not null references public.profiles(id) on delete cascade,
  invitado_por uuid not null references public.profiles(id),
  rol text not null default 'editor' check (rol in ('editor','viewer')),
  estado text not null default 'pendiente' check (estado in ('pendiente','aceptada','rechazada','expirada','cancelada')),
  expira_en timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  respondida_en timestamptz
);
create unique index invitacion_pendiente_unica on public.invitaciones (caja_id, invitado_id) where estado = 'pendiente';
create index invitaciones_invitado on public.invitaciones (invitado_id) where estado = 'pendiente';

-- ───────────────────────── movimientos ─────────────────────────
create table public.transacciones (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.cajas(id) on delete cascade,
  tipo text not null check (tipo in ('gasto','ingreso','transferencia','traspaso_sal','traspaso_ent')),
  monto_centavos bigint not null check (monto_centavos > 0),
  descripcion text not null check (char_length(btrim(descripcion)) between 1 and 120),
  categoria text not null default 'Otros' references public.categorias(nombre),
  categoria_confianza numeric(3,2) check (categoria_confianza between 0 and 1),
  fecha date not null,
  pagada_por uuid not null references public.profiles(id),
  creada_por uuid not null references public.profiles(id),
  recurrente_id uuid,
  par_id uuid references public.transacciones(id) deferrable initially deferred,
  created_at timestamptz not null default now()
);
create index transacciones_caja_fecha on public.transacciones (caja_id, fecha desc);
create index transacciones_recurrente on public.transacciones (recurrente_id) where recurrente_id is not null;

-- Cómo se reparte cada gasto (y a quién va dirigido cada pago entre miembros)
create table public.divisiones (
  transaccion_id uuid not null references public.transacciones(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  monto_centavos bigint not null check (monto_centavos > 0),
  primary key (transaccion_id, user_id)
);

create table public.presupuestos (
  caja_id uuid not null references public.cajas(id) on delete cascade,
  categoria text not null references public.categorias(nombre),
  limite_centavos bigint not null check (limite_centavos > 0),
  primary key (caja_id, categoria)
);

create table public.recurrentes (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.cajas(id) on delete cascade,
  creada_por uuid not null references public.profiles(id),
  tipo text not null check (tipo in ('gasto','ingreso')),
  monto_centavos bigint not null check (monto_centavos > 0),
  descripcion text not null,
  categoria text not null references public.categorias(nombre),
  pagada_por uuid not null references public.profiles(id),
  dia smallint not null check (dia between 1 and 31),
  divisiones jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.transacciones
  add constraint transacciones_recurrente_fk foreign key (recurrente_id) references public.recurrentes(id) on delete set null;

-- ───────────────────────── avisos y auditoría ─────────────────────────
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null,
  mensaje text not null,
  payload jsonb not null default '{}'::jsonb,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);
create index notificaciones_user on public.notificaciones (user_id, created_at desc);

create table public.auditoria (
  id bigserial primary key,
  user_id uuid,
  caja_id uuid references public.cajas(id) on delete cascade,
  accion text not null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index auditoria_caja on public.auditoria (caja_id, created_at desc);

-- ───────────────────────── helpers de acceso ─────────────────────────
-- Son SECURITY DEFINER para poder consultar caja_miembros sin recursión de RLS.
create function public.es_miembro(p_caja uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select true from public.caja_miembros
                    where caja_id = p_caja and user_id = p_user and estado = 'activo'), false)
$$;

create function public.puede_escribir(p_caja uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select true from public.caja_miembros
                    where caja_id = p_caja and user_id = p_user and estado = 'activo' and rol in ('owner','editor')), false)
$$;

create function public.es_owner(p_caja uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select true from public.caja_miembros
                    where caja_id = p_caja and user_id = p_user and estado = 'activo' and rol = 'owner'), false)
$$;

-- ¿Comparte alguna caja activa con otra persona? (para ver su nombre)
create function public.comparte_caja(p_otro uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.caja_miembros a
    join public.caja_miembros b on b.caja_id = a.caja_id and b.estado = 'activo'
    where a.user_id = auth.uid() and a.estado = 'activo' and b.user_id = p_otro)
$$;

-- Funciones internas (no expuestas a la API)
create function public._err(p_codigo text) returns void language plpgsql as $$
begin raise exception '%', p_codigo using errcode = 'P0001'; end $$;

create function public._uid() returns uuid language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  return v;
end $$;

create function public._avisar(p_user uuid, p_tipo text, p_mensaje text, p_payload jsonb default '{}')
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.notificaciones (user_id, tipo, mensaje, payload) values (p_user, p_tipo, p_mensaje, p_payload)
$$;

create function public._auditar(p_caja uuid, p_accion text, p_detalle jsonb default '{}')
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.auditoria (user_id, caja_id, accion, detalle) values (auth.uid(), p_caja, p_accion, p_detalle)
$$;

create function public._crear_caja(p_owner uuid, p_nombre text, p_color text, p_moneda text, p_meta bigint)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into public.cajas (nombre, color, moneda, meta_centavos, owner_id)
    values (btrim(p_nombre), coalesce(p_color,'#2A43E6'), p_moneda, p_meta, p_owner) returning id into v_id;
  insert into public.caja_miembros (caja_id, user_id, rol) values (v_id, p_owner, 'owner');
  return v_id;
end $$;

-- ───────────────────────── triggers ─────────────────────────
-- Alta de usuario: perfil + primera caja
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, nombre, email)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data->>'nombre'), ''), split_part(new.email, '@', 1)),
          lower(new.email));
  perform public._crear_caja(new.id, 'Mis gastos', '#2A43E6', 'ARS', null);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- La caja pasa a "compartida" cuando tiene más de un miembro activo
create function public._refrescar_tipo_caja() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_caja uuid := coalesce(new.caja_id, old.caja_id);
begin
  update public.cajas set tipo = case when (select count(*) from public.caja_miembros
                                             where caja_id = v_caja and estado = 'activo') > 1
                                      then 'compartida' else 'privada' end
   where id = v_caja;
  return null;
end $$;
create trigger caja_miembros_tipo after insert or update or delete on public.caja_miembros
  for each row execute function public._refrescar_tipo_caja();

-- La moneda y el dueño de una caja no cambian
create function public._cajas_inmutables() returns trigger language plpgsql as $$
begin
  if new.moneda <> old.moneda then raise exception 'moneda_inmutable' using errcode = 'P0001'; end if;
  if new.owner_id <> old.owner_id then raise exception 'owner_inmutable' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger cajas_inmutables before update on public.cajas
  for each row execute function public._cajas_inmutables();

-- ───────────────────────── RLS ─────────────────────────
alter table public.monedas enable row level security;
alter table public.tipos_cambio enable row level security;
alter table public.categorias enable row level security;
alter table public.profiles enable row level security;
alter table public.tipos_cambio_usuario enable row level security;
alter table public.cajas enable row level security;
alter table public.caja_miembros enable row level security;
alter table public.invitaciones enable row level security;
alter table public.transacciones enable row level security;
alter table public.divisiones enable row level security;
alter table public.presupuestos enable row level security;
alter table public.recurrentes enable row level security;
alter table public.notificaciones enable row level security;
alter table public.auditoria enable row level security;

create policy catalogo_monedas on public.monedas for select to authenticated using (true);
create policy catalogo_cambio on public.tipos_cambio for select to authenticated using (true);
create policy catalogo_categorias on public.categorias for select to authenticated using (true);

create policy perfil_propio_o_compartido on public.profiles for select to authenticated
  using (id = auth.uid() or public.comparte_caja(id));
create policy perfil_editar on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy cambio_usuario_select on public.tipos_cambio_usuario for select to authenticated using (user_id = auth.uid());
create policy cambio_usuario_insert on public.tipos_cambio_usuario for insert to authenticated with check (user_id = auth.uid());
create policy cambio_usuario_update on public.tipos_cambio_usuario for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cambio_usuario_delete on public.tipos_cambio_usuario for delete to authenticated using (user_id = auth.uid());

create policy caja_ver on public.cajas for select to authenticated using (public.es_miembro(id));
create policy caja_editar on public.cajas for update to authenticated
  using (public.es_owner(id)) with check (public.es_owner(id));

create policy miembros_ver on public.caja_miembros for select to authenticated using (public.es_miembro(caja_id));

-- El invitado ve sus invitaciones; el creador de la caja ve las que envió.
-- El invitado NO obtiene acceso a la caja por tener una invitación.
create policy invitaciones_ver on public.invitaciones for select to authenticated
  using (invitado_id = auth.uid() or public.es_owner(caja_id));

create policy tx_ver on public.transacciones for select to authenticated using (public.es_miembro(caja_id));
create policy div_ver on public.divisiones for select to authenticated
  using (exists (select 1 from public.transacciones t where t.id = transaccion_id and public.es_miembro(t.caja_id)));
create policy presupuestos_ver on public.presupuestos for select to authenticated using (public.es_miembro(caja_id));
create policy recurrentes_ver on public.recurrentes for select to authenticated using (public.es_miembro(caja_id));

create policy avisos_ver on public.notificaciones for select to authenticated using (user_id = auth.uid());
create policy avisos_leer on public.notificaciones for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy auditoria_owner on public.auditoria for select to authenticated using (public.es_owner(caja_id));

-- ───────────────────────── funciones de la API ─────────────────────────
-- Los errores esperables salen como mensajes cortos (p. ej. 'sin_permiso'); la app los traduce.

create function public.crear_caja(p_nombre text, p_color text, p_moneda text, p_meta bigint default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid();
begin
  if p_nombre is null or btrim(p_nombre) = '' or char_length(btrim(p_nombre)) > 60 then perform public._err('nombre_invalido'); end if;
  if not exists (select 1 from public.monedas where codigo = p_moneda) then perform public._err('moneda_invalida'); end if;
  if p_meta is not null and p_meta <= 0 then perform public._err('meta_invalida'); end if;
  return public._crear_caja(v, p_nombre, p_color, p_moneda, p_meta);
end $$;

create function public.invitar_a_caja(p_caja uuid, p_email text, p_rol text default 'editor')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); v_inv uuid; v_dest public.profiles; v_caja public.cajas; v_yo text;
begin
  if not public.es_owner(p_caja, v) then perform public._err('sin_permiso'); end if;
  if p_rol not in ('editor','viewer') then perform public._err('rol_invalido'); end if;
  select * into v_dest from public.profiles where lower(email) = lower(btrim(coalesce(p_email,'')));
  if not found then perform public._err('email_no_registrado'); end if;
  if v_dest.id = v then perform public._err('es_tu_cuenta'); end if;
  if public.es_miembro(p_caja, v_dest.id) then perform public._err('ya_es_miembro'); end if;
  if exists (select 1 from public.invitaciones where caja_id = p_caja and invitado_id = v_dest.id and estado = 'pendiente' and expira_en > now())
    then perform public._err('invitacion_pendiente'); end if;
  update public.invitaciones set estado = 'expirada'
   where caja_id = p_caja and invitado_id = v_dest.id and estado = 'pendiente' and expira_en <= now();
  select * into v_caja from public.cajas where id = p_caja;
  select nombre into v_yo from public.profiles where id = v;
  insert into public.invitaciones (caja_id, invitado_id, invitado_por, rol)
    values (p_caja, v_dest.id, v, p_rol) returning id into v_inv;
  perform public._avisar(v_dest.id, 'invitacion', v_yo || ' te invitó a la caja “' || v_caja.nombre || '”.',
    jsonb_build_object('invitacion_id', v_inv, 'caja_nombre', v_caja.nombre, 'por_nombre', v_yo));
  perform public._auditar(p_caja, 'invitar', jsonb_build_object('invitado', v_dest.id, 'rol', p_rol));
  return v_inv;
end $$;

-- Lo único que ve el invitado antes de aceptar: nombre de la caja y quién lo invita.
create function public.mis_invitaciones()
returns table (id uuid, caja_nombre text, por_nombre text, rol text, creada timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.id, c.nombre, p.nombre, i.rol, i.created_at
    from public.invitaciones i
    join public.cajas c on c.id = i.caja_id
    join public.profiles p on p.id = i.invitado_por
   where i.invitado_id = auth.uid() and i.estado = 'pendiente' and i.expira_en > now()
   order by i.created_at desc
$$;

create function public.responder_invitacion(p_id uuid, p_aceptar boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); i public.invitaciones; v_caja public.cajas; v_yo text;
begin
  select * into i from public.invitaciones where id = p_id and invitado_id = v and estado = 'pendiente' for update;
  if not found then perform public._err('invitacion_no_valida'); end if;
  if i.expira_en <= now() then
    update public.invitaciones set estado = 'expirada' where id = i.id;
    return null;   -- se confirma el cambio de estado; la app informa que venció
  end if;
  select * into v_caja from public.cajas where id = i.caja_id;
  select nombre into v_yo from public.profiles where id = v;
  if p_aceptar then
    insert into public.caja_miembros (caja_id, user_id, rol, estado) values (i.caja_id, v, i.rol, 'activo')
      on conflict (caja_id, user_id) do update set estado = 'activo', rol = excluded.rol;
    update public.invitaciones set estado = 'aceptada', respondida_en = now() where id = i.id;
    perform public._avisar(i.invitado_por, 'invitacion_aceptada', v_yo || ' aceptó tu invitación a “' || v_caja.nombre || '”.', jsonb_build_object('caja_id', i.caja_id));
    perform public._auditar(i.caja_id, 'unirse', jsonb_build_object('user', v));
    return i.caja_id;
  end if;
  update public.invitaciones set estado = 'rechazada', respondida_en = now() where id = i.id;
  perform public._avisar(i.invitado_por, 'invitacion_rechazada', v_yo || ' rechazó la invitación a “' || v_caja.nombre || '”.', '{}');
  return null;
end $$;

create function public.cancelar_invitacion(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); i public.invitaciones;
begin
  select * into i from public.invitaciones where id = p_id and estado = 'pendiente';
  if not found or not public.es_owner(i.caja_id, v) then perform public._err('invitacion_no_valida'); end if;
  update public.invitaciones set estado = 'cancelada', respondida_en = now() where id = p_id;
end $$;

create function public.quitar_miembro(p_caja uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); v_nombre text;
begin
  if not public.es_owner(p_caja, v) then perform public._err('sin_permiso'); end if;
  if p_user = v then perform public._err('no_podes_quitarte'); end if;
  update public.caja_miembros set estado = 'removido' where caja_id = p_caja and user_id = p_user and estado = 'activo';
  if not found then perform public._err('no_encontrado'); end if;
  select nombre into v_nombre from public.cajas where id = p_caja;
  perform public._avisar(p_user, 'removido', 'Te quitaron de la caja “' || v_nombre || '”.', '{}');
  perform public._auditar(p_caja, 'quitar_miembro', jsonb_build_object('user', p_user));
end $$;

create function public.salir_de_caja(p_caja uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid();
begin
  if public.es_owner(p_caja, v) then perform public._err('el_creador_no_puede_salir'); end if;
  update public.caja_miembros set estado = 'removido' where caja_id = p_caja and user_id = v and estado = 'activo';
  if not found then perform public._err('no_encontrado'); end if;
  perform public._auditar(p_caja, 'salir', jsonb_build_object('user', v));
end $$;

-- Movimiento nuevo (gasto o ingreso). p_divisiones: {"<user_id>": centavos, ...}; para gastos debe sumar el total.
create function public.registrar_movimiento(
  p_caja uuid, p_tipo text, p_monto bigint, p_descripcion text, p_categoria text, p_confianza numeric,
  p_fecha date, p_pagada_por uuid, p_divisiones jsonb default '{}'::jsonb, p_repite boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v uuid := public._uid(); v_id uuid := gen_random_uuid(); v_cat text; v_rec uuid;
  k text; val bigint; v_sum bigint := 0; v_n int := 0; v_div jsonb := coalesce(p_divisiones, '{}'::jsonb);
begin
  if not public.puede_escribir(p_caja, v) then perform public._err('sin_permiso'); end if;
  if p_tipo not in ('gasto','ingreso') then perform public._err('tipo_invalido'); end if;
  if p_monto is null or p_monto <= 0 then perform public._err('monto_invalido'); end if;
  if p_descripcion is null or btrim(p_descripcion) = '' or char_length(btrim(p_descripcion)) > 120 then perform public._err('descripcion_invalida'); end if;
  if p_fecha is null or p_fecha < current_date - interval '10 years' or p_fecha > current_date + interval '1 year' then perform public._err('fecha_invalida'); end if;
  if not public.es_miembro(p_caja, p_pagada_por) then perform public._err('pagador_invalido'); end if;
  if p_tipo = 'ingreso' then v_cat := 'Ingresos';
  else
    v_cat := case when exists (select 1 from public.categorias where nombre = p_categoria) and p_categoria <> 'Ingresos' then p_categoria else 'Otros' end;
    if jsonb_typeof(v_div) <> 'object' then perform public._err('divisiones_invalidas'); end if;
    begin
      for k, val in select key, value::bigint from jsonb_each_text(v_div) loop
        if val <= 0 or not public.es_miembro(p_caja, k::uuid) then perform public._err('divisiones_invalidas'); end if;
        v_sum := v_sum + val; v_n := v_n + 1;
      end loop;
    exception when invalid_text_representation then perform public._err('divisiones_invalidas');
    end;
    if v_n = 0 or v_sum <> p_monto then perform public._err('divisiones_invalidas'); end if;
  end if;

  if p_repite then
    insert into public.recurrentes (caja_id, creada_por, tipo, monto_centavos, descripcion, categoria, pagada_por, dia, divisiones)
      values (p_caja, v, p_tipo, p_monto, btrim(p_descripcion), v_cat, p_pagada_por, extract(day from p_fecha)::smallint,
              case when p_tipo = 'gasto' then v_div else '{}'::jsonb end)
      returning id into v_rec;
  end if;

  insert into public.transacciones (id, caja_id, tipo, monto_centavos, descripcion, categoria, categoria_confianza, fecha, pagada_por, creada_por, recurrente_id)
    values (v_id, p_caja, p_tipo, p_monto, btrim(p_descripcion), v_cat, p_confianza, p_fecha, p_pagada_por, v, v_rec);
  if p_tipo = 'gasto' then
    insert into public.divisiones (transaccion_id, user_id, monto_centavos)
      select v_id, key::uuid, value::bigint from jsonb_each_text(v_div);
  end if;
  perform public._auditar(p_caja, 'movimiento', jsonb_build_object('id', v_id, 'tipo', p_tipo, 'monto', p_monto));
  return v_id;
end $$;

create function public.eliminar_movimiento(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); t public.transacciones; o public.transacciones;
begin
  select * into t from public.transacciones where id = p_id;
  if not found or not public.es_miembro(t.caja_id, v) then perform public._err('no_encontrado'); end if;
  if t.creada_por <> v and not public.es_owner(t.caja_id, v) then perform public._err('sin_permiso'); end if;
  if t.par_id is not null then
    select * into o from public.transacciones where id = t.par_id;
    if found then
      if o.creada_por = v or public.es_owner(o.caja_id, v) then delete from public.transacciones where id = o.id;
      else update public.transacciones set par_id = null where id = o.id; end if;
    end if;
  end if;
  delete from public.transacciones where id = p_id;
  perform public._auditar(t.caja_id, 'eliminar_movimiento', jsonb_build_object('id', p_id, 'monto', t.monto_centavos, 'descripcion', t.descripcion));
end $$;

-- Pago entre miembros para saldar deudas
create function public.registrar_pago(p_caja uuid, p_de uuid, p_a uuid, p_monto bigint)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); v_id uuid := gen_random_uuid(); n_de text; n_a text; n_caja text;
begin
  if not public.puede_escribir(p_caja, v) then perform public._err('sin_permiso'); end if;
  if p_monto is null or p_monto <= 0 then perform public._err('monto_invalido'); end if;
  if p_de = p_a or not public.es_miembro(p_caja, p_de) or not public.es_miembro(p_caja, p_a) then perform public._err('pago_invalido'); end if;
  select nombre into n_de from public.profiles where id = p_de;
  select nombre into n_a from public.profiles where id = p_a;
  select nombre into n_caja from public.cajas where id = p_caja;
  insert into public.transacciones (id, caja_id, tipo, monto_centavos, descripcion, categoria, fecha, pagada_por, creada_por)
    values (v_id, p_caja, 'transferencia', p_monto, 'Pago de ' || n_de || ' a ' || n_a, 'Otros', current_date, p_de, v);
  insert into public.divisiones (transaccion_id, user_id, monto_centavos) values (v_id, p_a, p_monto);
  if p_a <> v then perform public._avisar(p_a, 'pago', 'Se registró un pago de ' || n_de || ' a vos en “' || n_caja || '”.', jsonb_build_object('caja_id', p_caja)); end if;
  perform public._auditar(p_caja, 'pago', jsonb_build_object('de', p_de, 'a', p_a, 'monto', p_monto));
  return v_id;
end $$;

-- Mover plata entre dos cajas propias (puede ser entre monedas distintas)
create function public.traspasar(p_desde uuid, p_hacia uuid, p_sale bigint, p_llega bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  if p_desde = p_hacia then perform public._err('cajas_iguales'); end if;
  if not public.puede_escribir(p_desde, v) or not public.puede_escribir(p_hacia, v) then perform public._err('sin_permiso'); end if;
  if p_sale is null or p_sale <= 0 or p_llega is null or p_llega <= 0 then perform public._err('monto_invalido'); end if;
  insert into public.transacciones (id, caja_id, tipo, monto_centavos, descripcion, fecha, pagada_por, creada_por, par_id)
    values (a, p_desde, 'traspaso_sal', p_sale, 'Traspaso a otra caja', current_date, v, v, b),
           (b, p_hacia, 'traspaso_ent', p_llega, 'Traspaso desde otra caja', current_date, v, v, a);
  perform public._auditar(p_desde, 'traspaso', jsonb_build_object('hacia', p_hacia, 'sale', p_sale, 'llega', p_llega));
  perform public._auditar(p_hacia, 'traspaso', jsonb_build_object('desde', p_desde, 'sale', p_sale, 'llega', p_llega));
end $$;

create function public.definir_presupuestos(p_caja uuid, p_presupuestos jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); k text; val bigint;
begin
  if not public.puede_escribir(p_caja, v) then perform public._err('sin_permiso'); end if;
  if jsonb_typeof(coalesce(p_presupuestos,'{}'::jsonb)) <> 'object' then perform public._err('presupuesto_invalido'); end if;
  delete from public.presupuestos where caja_id = p_caja;
  for k, val in select key, value::bigint from jsonb_each_text(coalesce(p_presupuestos,'{}'::jsonb)) loop
    if val <= 0 or k = 'Ingresos' or not exists (select 1 from public.categorias where nombre = k) then perform public._err('presupuesto_invalido'); end if;
    insert into public.presupuestos (caja_id, categoria, limite_centavos) values (p_caja, k, val);
  end loop;
end $$;

create function public.detener_recurrente(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid(); r public.recurrentes;
begin
  select * into r from public.recurrentes where id = p_id;
  if not found or not public.es_miembro(r.caja_id, v) then perform public._err('no_encontrado'); end if;
  if r.creada_por <> v and not public.es_owner(r.caja_id, v) then perform public._err('sin_permiso'); end if;
  update public.recurrentes set activo = false where id = p_id;
end $$;

-- Neto de cada miembro en la caja: lo que pagó menos lo que le corresponde. Positivo = le deben.
create function public.saldos_caja(p_caja uuid)
returns table (user_id uuid, neto_centavos bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.es_miembro(p_caja, auth.uid()) then perform public._err('sin_permiso'); end if;
  return query
    select x.u, sum(x.v)::bigint from (
      select t.pagada_por as u, t.monto_centavos as v from public.transacciones t
       where t.caja_id = p_caja and t.tipo in ('gasto','transferencia')
      union all
      select d.user_id, -d.monto_centavos from public.divisiones d
        join public.transacciones t on t.id = d.transaccion_id
       where t.caja_id = p_caja and t.tipo in ('gasto','transferencia')
      union all
      select m.user_id, 0::bigint from public.caja_miembros m where m.caja_id = p_caja and m.estado = 'activo'
    ) x group by x.u;
end $$;

-- Genera los movimientos mensuales que faltan. Idempotente. Solo lo ejecuta el servidor (cron / service_role).
create function public.ejecutar_recurrentes(p_hoy date default current_date)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.recurrentes; m date; v_ini date; v_fecha date; v_id uuid; n integer := 0;
begin
  for r in select * from public.recurrentes where activo loop
    select date_trunc('month', min(fecha))::date into v_ini from public.transacciones where recurrente_id = r.id;
    if v_ini is null then v_ini := date_trunc('month', r.created_at)::date; end if;
    for m in select g::date from generate_series(v_ini + interval '1 month', date_trunc('month', p_hoy::timestamp), interval '1 month') g loop
      v_fecha := least(m + (r.dia - 1), (m + interval '1 month - 1 day')::date);
      continue when v_fecha > p_hoy;
      continue when exists (select 1 from public.transacciones where recurrente_id = r.id and date_trunc('month', fecha)::date = m);
      continue when not public.es_miembro(r.caja_id, r.pagada_por);
      continue when exists (select 1 from jsonb_each_text(r.divisiones) j where not public.es_miembro(r.caja_id, j.key::uuid));
      v_id := gen_random_uuid();
      insert into public.transacciones (id, caja_id, tipo, monto_centavos, descripcion, categoria, fecha, pagada_por, creada_por, recurrente_id)
        values (v_id, r.caja_id, r.tipo, r.monto_centavos, r.descripcion, r.categoria, v_fecha, r.pagada_por, r.creada_por, r.id);
      if r.tipo = 'gasto' then
        insert into public.divisiones (transaccion_id, user_id, monto_centavos)
          select v_id, key::uuid, value::bigint from jsonb_each_text(r.divisiones);
      end if;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- ───────────────────────── vista con fondos ─────────────────────────
create view public.cajas_resumen with (security_invoker = true) as
select c.id, c.nombre, c.color, c.moneda, c.tipo, c.meta_centavos, c.owner_id, c.archivada, c.created_at,
       coalesce((select sum(case when t.tipo in ('ingreso','traspaso_ent') then t.monto_centavos
                                 when t.tipo in ('gasto','traspaso_sal') then -t.monto_centavos else 0 end)
                   from public.transacciones t where t.caja_id = c.id), 0)::bigint as fondos_centavos,
       (select count(*) from public.caja_miembros m where m.caja_id = c.id and m.estado = 'activo')::int as miembros
  from public.cajas c;

-- ───────────────────────── permisos ─────────────────────────
-- Todo cerrado por defecto; se abre solo lo necesario.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select on public.monedas, public.tipos_cambio, public.categorias, public.profiles, public.tipos_cambio_usuario,
  public.cajas, public.caja_miembros, public.invitaciones, public.transacciones, public.divisiones,
  public.presupuestos, public.recurrentes, public.notificaciones, public.auditoria, public.cajas_resumen to authenticated;
grant update (nombre, moneda_base) on public.profiles to authenticated;
grant insert, delete on public.tipos_cambio_usuario to authenticated;
grant update (por_usd) on public.tipos_cambio_usuario to authenticated;
grant update (nombre, color, meta_centavos, archivada) on public.cajas to authenticated;
grant update (leida) on public.notificaciones to authenticated;

-- Las políticas RLS llaman a estas funciones con los permisos de quien consulta.
grant execute on function public.es_miembro(uuid, uuid), public.puede_escribir(uuid, uuid),
  public.es_owner(uuid, uuid), public.comparte_caja(uuid) to authenticated;

grant execute on function
  public.crear_caja(text, text, text, bigint), public.invitar_a_caja(uuid, text, text), public.mis_invitaciones(),
  public.responder_invitacion(uuid, boolean), public.cancelar_invitacion(uuid), public.quitar_miembro(uuid, uuid),
  public.salir_de_caja(uuid), public.registrar_movimiento(uuid, text, bigint, text, text, numeric, date, uuid, jsonb, boolean),
  public.eliminar_movimiento(uuid), public.registrar_pago(uuid, uuid, uuid, bigint),
  public.traspasar(uuid, uuid, bigint, bigint), public.definir_presupuestos(uuid, jsonb),
  public.detener_recurrente(uuid), public.saldos_caja(uuid) to authenticated;

-- Las funciones internas y las del servidor no se exponen a la API pública.
-- (service_role es un rol de Supabase; ejecutar_recurrentes la llama el cron o un job del servidor.)
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ejecutar_recurrentes(date) to service_role;
  end if;
end $$;
