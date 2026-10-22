-- Cajas dentro de cajas, nombres de usuario, fotos e invitaciones nuevas. Se corre después de 10_*.
-- (reutiliza el esquema t y los usuarios ana, beto y carla creados allí)
\set QUIET on
set client_min_messages = notice;
select t.admin();
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d4', 'dani@test.com', '{"nombre":"Dani","username":"Ana"}'),
  ('00000000-0000-0000-0000-0000000000e5', 'eli@test.com', '{"nombre":"Eli"}'),
  ('00000000-0000-0000-0000-0000000000f6', 'fer@test.com', '{"nombre":"Fer","username":"@Fer_01"}');
insert into t.ctx values ('dani','00000000-0000-0000-0000-0000000000d4'),('eli','00000000-0000-0000-0000-0000000000e5'),('fer','00000000-0000-0000-0000-0000000000f6');

-- ── nombres de usuario ──
select t.ok((select username from public.profiles where id = t.uid('ana')) = 'ana', 'el nombre de usuario del alta se guarda');
select t.ok((select username from public.profiles where id = t.uid('fer')) = 'fer_01', 'se normaliza (sin @, en minúsculas)');
select t.ok((select username from public.profiles where id = t.uid('dani')) is null, 'si el nombre ya estaba tomado, el alta no falla y queda sin nombre de usuario');
select t.ok((select username from public.profiles where id = t.uid('eli')) is null, 'sin nombre de usuario en el alta queda pendiente');
set role anon;
select t.ok(public.username_disponible('libre_123'), 'sin sesión se puede ver si un nombre está libre');
select t.ok(not public.username_disponible('ANA'), 'un nombre tomado no está disponible (sin distinguir mayúsculas)');
select t.ok(not public.username_disponible('ab') and not public.username_disponible('con espacio') and not public.username_disponible('admin'), 'inválidos y reservados no están disponibles');
select t.falla($$ select * from public.buscar_usuarios('ana') $$, 'permission denied', 'sin sesión no se busca gente');
reset role;

select t.como('eli');
select t.falla($$ select public.definir_username('ab') $$, 'username_invalido', 'muy corto');
select t.falla($$ select public.definir_username('hola chau') $$, 'username_invalido', 'con espacios');
select t.falla($$ select public.definir_username('ANA') $$, 'username_en_uso', 'no puede haber dos iguales');
select t.ok(public.definir_username('@Eli_Cajas') = 'eli_cajas', 'se puede elegir un nombre libre');
select t.falla($$ update public.profiles set username = 'robado' where id = t.uid('eli') $$, 'permission denied', 'el nombre de usuario solo cambia por la función');
select t.ok(public.definir_username('eli_cajas') = 'eli_cajas', 'volver a guardar el propio nombre no falla');

-- ── foto de perfil ──
update public.profiles set avatar_url = t.uid('eli')::text || '/avatar-1.jpg' where id = t.uid('eli');
select t.ok((select avatar_url from public.profiles where id = t.uid('eli')) like '%/avatar-1.jpg', 'se guarda la foto propia');
select t.falla($$ update public.profiles set avatar_url = t.uid('ana')::text || '/x.jpg' where id = t.uid('eli') $$, 'profiles_avatar_propio', 'no se puede apuntar a la carpeta de otra persona');
select t.falla($$ update public.profiles set avatar_url = 'http://malo.com/x.jpg' where id = t.uid('eli') $$, 'profiles_avatar_propio', 'la foto no puede ser una URL externa');

-- ── búsqueda de usuarios ──
select t.como('ana');
select t.ok((select count(*) from public.buscar_usuarios('el')) = 0, 'menos de 3 letras no devuelve nada');
select t.ok((select count(*) from public.buscar_usuarios('eli')) = 1 and (select username from public.buscar_usuarios('@ELI')) = 'eli_cajas', 'se busca por prefijo');
select t.ok((select count(*) from public.buscar_usuarios('ana')) = 0, 'la búsqueda no te incluye a vos');
select t.ok((select count(*) from public.buscar_usuarios('e_i')) = 0, 'el guion bajo no actúa como comodín');
select t.ok((select avatar_url from public.buscar_usuarios('eli')) like '%/avatar-1.jpg', 'el resultado incluye la foto');
select t.ok((select count(*) from public.profiles where id = t.uid('eli')) = 0, 'buscar no da acceso al perfil completo');

-- ── invitaciones por usuario, con aviso ──
select t.como('ana');
select set_config('t.casa2', public.crear_caja('Casa grande', '#0E8F6B', 'ARS', null)::text, false);
select t.falla($$ select public.invitar_a_caja(t.id('casa2'), 'eli_cajas@x') $$, 'usuario_no_encontrado', 'usuario con formato inválido no se encuentra');
select set_config('t.inv_eli', public.invitar_a_caja(t.id('casa2'), '@Eli_Cajas', 'editor')::text, false);
select t.ok((select count(*) from public.invitaciones_de_caja(t.id('casa2'))) = 1 and (select username from public.invitaciones_de_caja(t.id('casa2'))) = 'eli_cajas', 'el dueño ve a quién invitó, con su usuario');
select t.como('eli');
select t.ok((select count(*) from public.cajas where id = t.id('casa2')) = 0, 'el invitado no ve la caja antes de aceptar');
select t.ok((select nueva from public.mis_invitaciones()) and (select por_username from public.mis_invitaciones()) = 'ana', 'la invitación llega como nueva, con el usuario de quien invita');
select public.marcar_invitaciones_vistas();
select t.ok(not (select nueva from public.mis_invitaciones()), 'tras mostrar el cartel ya no es nueva (pero sigue pendiente)');
select t.falla($$ select * from public.invitaciones_de_caja(t.id('casa2')) $$, 'sin_permiso', 'el invitado no ve las invitaciones de la caja');
select t.ok(public.responder_invitacion(t.id('inv_eli'), true) = t.id('casa2'), 'acepta desde la app');
select t.ok((select count(*) from public.cajas where id = t.id('casa2')) = 1, 'recién al aceptar ve la caja');

-- ── cajas dentro de cajas ──
select t.como('ana');
select set_config('t.heladera', public.crear_subcaja(t.id('casa2'), 'Heladera', null, 150000000)::text, false);
select set_config('t.luz', public.crear_subcaja(t.id('casa2'), 'Factura de luz')::text, false);
select t.ok((select moneda from public.cajas where id = t.id('heladera')) = 'ARS' and (select tipo from public.cajas where id = t.id('heladera')) = 'compartida', 'la cajita hereda moneda y tipo');
select t.ok((select owner_id from public.cajas where id = t.id('heladera')) = t.uid('ana'), 'la cajita pertenece al dueño de la principal');
select t.falla($$ select public.crear_subcaja(t.id('heladera'), 'Nieta') $$, 'subcaja_en_subcaja', 'solo un nivel');
select t.falla($$ select public.crear_subcaja(t.id('casa2'), '  ') $$, 'nombre_invalido', 'nombre vacío');
select t.falla($$ insert into public.cajas (nombre, moneda, owner_id, padre_id) values ('x','ARS',t.uid('ana'),t.id('casa2')) $$, 'permission denied', 'no se crean cajitas por fuera de la función');
select t.falla($$ update public.cajas set padre_id = null where id = t.id('heladera') $$, 'permission denied', 'no se mueve una cajita a mano');

select public.registrar_movimiento(t.id('heladera'), 'ingreso', 40000, 'Ahorro heladera', null, null, current_date, t.uid('ana'));
select public.registrar_movimiento(t.id('luz'), 'ingreso', 25000, 'Ahorro luz', null, null, current_date, t.uid('ana'));
select public.registrar_movimiento(t.id('casa2'), 'ingreso', 5000, 'Sobrante', null, null, current_date, t.uid('ana'));
select t.ok((select fondos_centavos from public.cajas_resumen where id = t.id('heladera')) = 40000, 'cada cajita cuenta lo suyo');
select t.ok((select fondos_total_centavos from public.cajas_resumen where id = t.id('casa2')) = 70000 and (select fondos_centavos from public.cajas_resumen where id = t.id('casa2')) = 5000, 'la caja grande suma sus cajitas (y se ve su propio fondo aparte)');
select t.ok((select subcajas from public.cajas_resumen where id = t.id('casa2')) = 2, 'cuenta las cajitas');
select t.ok((select miembros from public.cajas_resumen where id = t.id('heladera')) = 2, 'la cajita muestra los miembros de la principal');

-- los permisos se resuelven contra la principal
select t.como('eli');
select t.ok((select count(*) from public.cajas where padre_id = t.id('casa2')) = 2, 'un miembro de la principal ve las cajitas');
select public.registrar_movimiento(t.id('heladera'), 'gasto', 10000, 'Cuota', 'Hogar', null, current_date, t.uid('eli'),
  jsonb_build_object(t.uid('eli')::text, 5000, t.uid('ana')::text, 5000));
select t.ok(t.neto('casa2','eli') = 5000 and t.neto('casa2','ana') = -5000, 'los saldos juntan gastos de la principal y de sus cajitas');
select t.ok(t.neto('heladera','eli') = 5000, 'pedir los saldos de una cajita da los del grupo');
select t.falla($$ select public.invitar_a_caja(t.id('heladera'), 'carla') $$, 'sin_permiso', 'solo el dueño invita');
select t.como('ana');
select t.falla($$ select public.invitar_a_caja(t.id('heladera'), 'carla') $$, 'caja_principal_requerida', 'se invita a la caja principal, no a una cajita');
select public.traspasar(t.id('casa2'), t.id('heladera'), 1000, 1000);
select t.ok((select fondos_total_centavos from public.cajas_resumen where id = t.id('casa2')) = 60000, 'mover plata entre la grande y una cajita no cambia el total del grupo, y el gasto sí');

select t.como('carla');
select t.ok((select count(*) from public.cajas where id in (t.id('heladera'), t.id('luz'), t.id('casa2'))) = 0, 'quien no es miembro no ve ni las cajitas');
select t.falla($$ select public.crear_subcaja(t.id('casa2'), 'Mía') $$, 'sin_permiso', 'quien no es miembro no crea cajitas');
select t.falla($$ select public.registrar_movimiento(t.id('luz'), 'ingreso', 1, 'x', null, null, current_date, t.uid('carla')) $$, 'sin_permiso', 'ni carga movimientos en ellas');
select t.falla($$ select public.saldos_caja(t.id('luz')) $$, 'sin_permiso', 'ni ve sus saldos');

-- un "solo ve" no crea cajitas
select t.como('ana');
select public.invitar_a_caja(t.id('casa2'), 'carla', 'viewer');
select t.como('carla');
select public.responder_invitacion((select id from public.mis_invitaciones() limit 1), true);
select t.falla($$ select public.crear_subcaja(t.id('casa2'), 'Mía') $$, 'sin_permiso', 'un miembro "solo ve" no crea cajitas');

-- funciones internas siguen cerradas
select t.falla($$ select public._raiz(t.id('casa2')) $$, 'permission denied', '_raiz no se expone');
select t.falla($$ select public._username_limpio('x') $$, 'permission denied', '_username_limpio no se expone');

\echo
\echo 'TODAS LAS PRUEBAS PASARON'
