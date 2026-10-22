-- Pruebas de privacidad, permisos y reglas del negocio. Se corren con Postgres real:
--   psql -v ON_ERROR_STOP=1 -f 00_harness_supabase.sql -f ../migrations/*.sql -f 10_rls_y_reglas.test.sql
-- Cualquier fallo corta la ejecución con 'FALLÓ: ...'.
\set QUIET on
set client_min_messages = notice;

create schema t;
create table t.ctx (k text primary key, v text);
grant usage on schema t to authenticated, anon;
grant select on t.ctx to authenticated;
create function t.uid(n text) returns uuid language sql stable security definer as $$ select v::uuid from t.ctx where k = n $$;
create function t.id(n text) returns uuid language sql stable as $$ select current_setting('t.' || n)::uuid $$;
create function t.como(n text) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', (select v from t.ctx where k = n), false); execute 'set role authenticated'; end $$;
create function t.admin() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
create function t.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FALLÓ: %', msg; end if; raise notice 'ok  - %', msg; end $$;
create function t.falla(q text, esperado text, msg text) returns void language plpgsql as $$
declare m text;
begin
  begin execute q; exception when others then m := sqlerrm; end;
  if m is null then raise exception 'FALLÓ (no dio error): %', msg; end if;
  if position(esperado in m) = 0 then raise exception 'FALLÓ (error distinto): % -> %', msg, m; end if;
  raise notice 'ok  - %', msg;
end $$;
create function t.neto(caja text, n text) returns bigint language sql stable as
$$ select coalesce((select neto_centavos from public.saldos_caja(t.id(caja)) where user_id = t.uid(n)), 0) $$;
grant execute on all functions in schema t to authenticated, anon;

-- ── alta de usuarios ──
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ana@test.com', '{"nombre":"Ana","username":"ana"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'beto@test.com', '{"nombre":"Beto","username":"beto"}'),
  ('00000000-0000-0000-0000-0000000000c3', 'carla@test.com', '{"nombre":"Carla","username":"carla"}');
insert into t.ctx values ('ana','00000000-0000-0000-0000-0000000000a1'),('beto','00000000-0000-0000-0000-0000000000b2'),('carla','00000000-0000-0000-0000-0000000000c3');

select t.ok((select count(*) from public.profiles) = 3, 'el alta crea un perfil por usuario');
select t.ok((select count(*) from public.cajas where nombre = 'Mis gastos' and moneda = 'ARS' and tipo = 'privada') = 3, 'cada usuario recibe su caja "Mis gastos"');
select t.ok((select email from public.profiles where id = t.uid('ana')) = 'ana@test.com', 'el email se guarda en minúsculas');

-- ── aislamiento ──
select t.como('ana');
select t.ok((select count(*) from public.cajas) = 1, 'Ana ve solo su caja');
select t.ok((select count(*) from public.profiles) = 1, 'Ana solo ve su propio perfil');
select t.como('beto');
select t.ok((select count(*) from public.cajas) = 1 and (select owner_id from public.cajas limit 1) = t.uid('beto'), 'Beto ve solo la suya');

-- ── crear caja y cerrojos de escritura directa ──
select t.como('ana');
select set_config('t.casa', public.crear_caja('Casa', '#0E8F6B', 'USD', null)::text, false);
select t.ok((select tipo from public.cajas where id = t.id('casa')) = 'privada', 'una caja nueva empieza privada');
select t.falla($$ select public.crear_caja('X', '#0E8F6B', 'JPY', null) $$, 'moneda_invalida', 'moneda no soportada se rechaza');
select t.falla($$ select public.crear_caja('   ', '#0E8F6B', 'ARS', null) $$, 'nombre_invalido', 'nombre vacío se rechaza');
select t.falla($$ insert into public.cajas (nombre, moneda, owner_id) values ('Hack', 'ARS', t.uid('ana')) $$, 'permission denied', 'no se puede insertar una caja directo');
select t.falla($$ insert into public.transacciones (caja_id, tipo, monto_centavos, descripcion, fecha, pagada_por, creada_por) values (t.id('casa'), 'ingreso', 1, 'x', current_date, t.uid('ana'), t.uid('ana')) $$, 'permission denied', 'no se puede insertar un movimiento directo');
select t.falla($$ insert into public.caja_miembros values (t.id('casa'), t.uid('beto'), 'editor') $$, 'permission denied', 'no se puede agregar un miembro directo');
select t.falla($$ update public.cajas set moneda = 'EUR' where id = t.id('casa') $$, 'permission denied', 'la moneda no se puede editar');
select t.falla($$ update public.cajas set owner_id = t.uid('beto') where id = t.id('casa') $$, 'permission denied', 'el dueño no se puede cambiar');
update public.cajas set nombre = 'Casa compartida' where id = t.id('casa');
select t.ok((select nombre from public.cajas where id = t.id('casa')) = 'Casa compartida', 'el dueño puede renombrar su caja');
update public.cajas set nombre = 'Casa' where id = t.id('casa');

select t.como('beto');
select t.ok((select count(*) from public.cajas where id = t.id('casa')) = 0, 'Beto no ve la caja de Ana');
select t.ok((select count(*) from public.caja_miembros where caja_id = t.id('casa')) = 0, 'Beto no ve sus miembros');
select t.falla($$ select public.invitar_a_caja(t.id('casa'), 'carla') $$, 'sin_permiso', 'quien no es dueño no puede invitar');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'ingreso', 100, 'x', null, null, current_date, t.uid('beto')) $$, 'sin_permiso', 'quien no es miembro no puede cargar movimientos');
select t.falla($$ select public.saldos_caja(t.id('casa')) $$, 'sin_permiso', 'quien no es miembro no ve los saldos');

-- ── flujo de invitación ──
select t.como('ana');
select t.falla($$ select public.invitar_a_caja(t.id('casa'), 'nadie') $$, 'usuario_no_encontrado', 'no se invita a un usuario que no existe');
select t.falla($$ select public.invitar_a_caja(t.id('casa'), 'ana') $$, 'es_tu_cuenta', 'no te podés invitar a vos mismo');
select t.falla($$ select public.invitar_a_caja(t.id('casa'), 'beto', 'owner') $$, 'rol_invalido', 'no se puede invitar como creador');
select set_config('t.inv_beto', public.invitar_a_caja(t.id('casa'), 'BETO', 'editor')::text, false);
select t.falla($$ select public.invitar_a_caja(t.id('casa'), 'beto') $$, 'invitacion_pendiente', 'no se duplica una invitación pendiente');

select t.como('beto');
select t.ok((select count(*) from public.mis_invitaciones()) = 1, 'Beto ve su invitación');
select t.ok((select caja_nombre from public.mis_invitaciones()) = 'Casa' and (select por_nombre from public.mis_invitaciones()) = 'Ana', 'la invitación muestra solo el nombre de la caja y quién invita');
select t.ok((select count(*) from public.cajas where id = t.id('casa')) = 0, 'con la invitación pendiente Beto TODAVÍA no ve la caja');
select t.ok((select count(*) from public.transacciones) = 0, 'ni sus movimientos');
select t.ok((select count(*) from public.notificaciones where tipo = 'invitacion') = 1, 'Beto recibió el aviso');
select t.falla($$ update public.invitaciones set estado = 'aceptada' where id = t.id('inv_beto') $$, 'permission denied', 'no se puede aceptar editando la tabla');

select t.como('carla');
select t.falla($$ select public.responder_invitacion(t.id('inv_beto'), true) $$, 'invitacion_no_valida', 'otra persona no puede aceptar la invitación de Beto');
select t.ok((select count(*) from public.mis_invitaciones()) = 0, 'Carla no ve invitaciones ajenas');
select t.ok((select count(*) from public.invitaciones) = 0, 'ni en la tabla');

select t.como('beto');
select t.ok(public.responder_invitacion(t.id('inv_beto'), true) = t.id('casa'), 'Beto acepta y recibe el id de la caja');
select t.ok((select count(*) from public.cajas where id = t.id('casa')) = 1, 'después de aceptar, Beto ve la caja');
select t.ok((select tipo from public.cajas where id = t.id('casa')) = 'compartida', 'la caja pasa a compartida');
select t.ok((select count(*) from public.caja_miembros where caja_id = t.id('casa')) = 2, 'Beto ve los 2 miembros');
select t.ok((select count(*) from public.profiles where id = t.uid('ana')) = 1, 'ahora Beto ve el nombre de Ana');
select t.falla($$ select public.responder_invitacion(t.id('inv_beto'), true) $$, 'invitacion_no_valida', 'una invitación no se acepta dos veces');
select t.como('carla');
select t.ok((select count(*) from public.profiles where id = t.uid('ana')) = 0, 'Carla sigue sin ver a Ana (no comparten caja)');
select t.como('ana');
select t.ok((select count(*) from public.notificaciones where tipo = 'invitacion_aceptada') = 1, 'Ana recibió el aviso de aceptación');

-- ── movimientos, divisiones y saldos ──
select set_config('t.gasto1', public.registrar_movimiento(t.id('casa'), 'gasto', 10000, 'Supermercado Coto', 'Supermercado', 0.93, current_date, t.uid('ana'),
  jsonb_build_object(t.uid('ana')::text, 5000, t.uid('beto')::text, 5000))::text, false);
select t.ok(t.neto('casa','ana') = 5000 and t.neto('casa','beto') = -5000, 'saldos tras un gasto de 100 dividido entre dos');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'gasto', 10000, 'x', 'Otros', null, current_date, t.uid('ana'), jsonb_build_object(t.uid('ana')::text, 4000, t.uid('beto')::text, 5000)) $$, 'divisiones_invalidas', 'las divisiones tienen que sumar el total');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'gasto', 10000, 'x', 'Otros', null, current_date, t.uid('ana'), jsonb_build_object(t.uid('carla')::text, 10000)) $$, 'divisiones_invalidas', 'no se divide con alguien que no es miembro');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'gasto', 10000, 'x', 'Otros', null, current_date, t.uid('ana'), '{}') $$, 'divisiones_invalidas', 'un gasto necesita división');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'gasto', 10000, 'x', 'Otros', null, current_date, t.uid('ana'), jsonb_build_object('no-es-uuid', 10000)) $$, 'divisiones_invalidas', 'ids mal formados se rechazan');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'gasto', 100, 'x', 'Otros', null, current_date, t.uid('carla'), jsonb_build_object(t.uid('ana')::text, 100)) $$, 'pagador_invalido', 'quien paga tiene que ser miembro');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'gasto', 0, 'x', 'Otros', null, current_date, t.uid('ana'), '{}') $$, 'monto_invalido', 'monto cero se rechaza');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'gasto', 100, '   ', 'Otros', null, current_date, t.uid('ana'), jsonb_build_object(t.uid('ana')::text, 100)) $$, 'descripcion_invalida', 'descripción vacía se rechaza');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'gasto', 100, 'x', 'Otros', null, date '1990-01-01', t.uid('ana'), jsonb_build_object(t.uid('ana')::text, 100)) $$, 'fecha_invalida', 'fechas absurdas se rechazan');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'transferencia', 100, 'x', 'Otros', null, current_date, t.uid('ana'), '{}') $$, 'tipo_invalido', 'las transferencias solo salen de registrar_pago');
select public.registrar_movimiento(t.id('casa'), 'ingreso', 20000, 'Aporte de Ana', null, null, current_date, t.uid('ana'));
select t.ok((select fondos_centavos from public.cajas_resumen where id = t.id('casa')) = 10000, 'fondos = ingresos - gastos');
select t.ok((select categoria from public.transacciones where descripcion = 'Aporte de Ana') = 'Ingresos', 'un ingreso siempre queda en la categoría Ingresos');
select public.registrar_movimiento(t.id('casa'), 'gasto', 500, 'Cosa rara', 'Categoría inventada', null, current_date, t.uid('ana'), jsonb_build_object(t.uid('ana')::text, 500));
select t.ok((select categoria from public.transacciones where descripcion = 'Cosa rara') = 'Otros', 'una categoría desconocida cae en Otros');
select t.falla($$ delete from public.transacciones $$, 'permission denied', 'no se borra directo');
select public.eliminar_movimiento((select id from public.transacciones where descripcion = 'Cosa rara'));

-- Carla entra como "solo ve"
select public.invitar_a_caja(t.id('casa'), 'carla', 'viewer');
select t.como('carla');
select public.responder_invitacion((select id from public.mis_invitaciones()), true);
select t.ok((select count(*) from public.transacciones where caja_id = t.id('casa')) = 2, 'Carla (solo ve) ve los movimientos');
select t.falla($$ select public.registrar_movimiento(t.id('casa'), 'ingreso', 100, 'x', null, null, current_date, t.uid('carla')) $$, 'sin_permiso', 'un miembro "solo ve" no puede cargar');
select t.falla($$ select public.definir_presupuestos(t.id('casa'), '{"Ocio": 1000}') $$, 'sin_permiso', 'ni definir presupuestos');

select t.como('beto');
select public.registrar_movimiento(t.id('casa'), 'gasto', 9000, 'Cena de los tres', 'Comida afuera', 0.9, current_date, t.uid('beto'),
  jsonb_build_object(t.uid('ana')::text, 3000, t.uid('beto')::text, 3000, t.uid('carla')::text, 3000));
select t.ok(t.neto('casa','ana') = 2000 and t.neto('casa','beto') = 1000 and t.neto('casa','carla') = -3000, 'saldos con tres personas (suman cero)');
select t.ok((select sum(neto_centavos) from public.saldos_caja(t.id('casa'))) = 0, 'los saldos siempre suman cero');

select t.como('ana');
select public.registrar_pago(t.id('casa'), t.uid('carla'), t.uid('ana'), 2000);
select t.ok(t.neto('casa','ana') = 0 and t.neto('casa','carla') = -1000 and t.neto('casa','beto') = 1000, 'un pago entre miembros ajusta los saldos');
select t.falla($$ select public.registrar_pago(t.id('casa'), t.uid('ana'), t.uid('ana'), 100) $$, 'pago_invalido', 'no se paga a uno mismo');
select t.ok((select fondos_centavos from public.cajas_resumen where id = t.id('casa')) = 1000, 'los pagos entre miembros no cambian los fondos');
select t.ok((select count(*) from public.notificaciones where tipo = 'pago') = 0, 'Ana no se avisa a sí misma');

-- ── eliminar ──
select t.como('beto');
select t.falla($$ select public.eliminar_movimiento(t.id('gasto1')) $$, 'sin_permiso', 'un editor no borra movimientos ajenos');
select t.como('carla');
select t.falla($$ select public.eliminar_movimiento(t.id('gasto1')) $$, 'sin_permiso', 'un "solo ve" no borra');
select t.como('ana');
select public.eliminar_movimiento((select id from public.transacciones where descripcion = 'Cena de los tres'));
select t.ok((select count(*) from public.transacciones where descripcion = 'Cena de los tres') = 0 and (select count(*) from public.divisiones where user_id = t.uid('carla')) = 0, 'el dueño borra movimientos ajenos y sus divisiones');

-- ── traspasos entre monedas ──
select set_config('t.mis', (select id::text from public.cajas where owner_id = t.uid('ana') and nombre = 'Mis gastos'), false);
select public.traspasar(t.id('casa'), t.id('mis'), 1000, 1450000);
select t.ok((select fondos_centavos from public.cajas_resumen where id = t.id('casa')) = 9000 and (select fondos_centavos from public.cajas_resumen where id = t.id('mis')) = 1450000, 'un traspaso mueve fondos entre cajas y monedas');
select t.como('beto');
select t.falla($$ select public.traspasar(t.id('casa'), t.id('mis'), 100, 100) $$, 'sin_permiso', 'Beto no puede traspasar hacia una caja que no es suya');
select t.como('ana');
select t.falla($$ select public.traspasar(t.id('casa'), t.id('casa'), 100, 100) $$, 'cajas_iguales', 'no se traspasa a la misma caja');
select public.eliminar_movimiento((select id from public.transacciones where caja_id = t.id('mis') and tipo = 'traspaso_ent'));
select t.ok((select count(*) from public.transacciones where tipo like 'traspaso%') = 0, 'borrar un lado del traspaso borra el otro');

-- ── presupuestos ──
select public.definir_presupuestos(t.id('casa'), '{"Comida afuera": 500000, "Supermercado": 1200000}');
select t.como('beto');
select t.ok((select count(*) from public.presupuestos where caja_id = t.id('casa')) = 2, 'los miembros ven los presupuestos');
select public.definir_presupuestos(t.id('casa'), '{"Comida afuera": 600000}');
select t.ok((select count(*) from public.presupuestos where caja_id = t.id('casa')) = 1, 'un editor puede redefinirlos');
select t.falla($$ select public.definir_presupuestos(t.id('casa'), '{"Inventada": 100}') $$, 'presupuesto_invalido', 'categoría inexistente');
select t.falla($$ select public.definir_presupuestos(t.id('casa'), '{"Ocio": -5}') $$, 'presupuesto_invalido', 'límite negativo');

-- ── recurrentes ──
select t.como('ana');
select set_config('t.alq', public.registrar_movimiento(t.id('casa'), 'gasto', 8000, 'Alquiler', 'Alquiler', 1, date '2026-07-05', t.uid('ana'),
  jsonb_build_object(t.uid('ana')::text, 4000, t.uid('beto')::text, 4000), true)::text, false);
select t.ok((select count(*) from public.recurrentes where caja_id = t.id('casa') and activo) = 1, 'se crea la plantilla recurrente');
select t.falla($$ select public.ejecutar_recurrentes(date '2026-10-19') $$, 'permission denied', 'la API pública no puede disparar los recurrentes');
select t.como('carla');
select t.falla($$ select public.detener_recurrente((select id from public.recurrentes limit 1)) $$, 'sin_permiso', 'un "solo ve" no detiene recurrentes');
select t.admin();
select t.ok(public.ejecutar_recurrentes(date '2026-10-19') = 3, 'genera agosto, septiembre y octubre');
select t.ok(public.ejecutar_recurrentes(date '2026-10-19') = 0, 'es idempotente');
select t.ok((select count(*) from public.divisiones d join public.transacciones x on x.id = d.transaccion_id where x.descripcion = 'Alquiler') = 8, 'cada ocurrencia lleva sus divisiones');
select t.como('ana');
select public.detener_recurrente((select id from public.recurrentes where caja_id = t.id('casa')));
select t.admin();
select t.ok(public.ejecutar_recurrentes(date '2026-12-20') = 0, 'detenido, no genera más');

-- ── quitar miembros y volver a invitar ──
select t.como('ana');
select t.falla($$ select public.quitar_miembro(t.id('casa'), t.uid('ana')) $$, 'no_podes_quitarte', 'el dueño no se quita a sí mismo');
select t.falla($$ select public.salir_de_caja(t.id('casa')) $$, 'el_creador_no_puede_salir', 'el dueño no puede salir');
select public.quitar_miembro(t.id('casa'), t.uid('beto'));
select t.como('beto');
select t.ok((select count(*) from public.cajas where id = t.id('casa')) = 0, 'al quitarlo, Beto pierde el acceso a la caja');
select t.ok((select count(*) from public.transacciones where caja_id = t.id('casa')) = 0, 'y a sus movimientos');
select t.falla($$ select public.saldos_caja(t.id('casa')) $$, 'sin_permiso', 'y a los saldos');
select t.ok((select count(*) from public.notificaciones where tipo = 'removido') = 1, 'Beto recibió el aviso');
select t.como('carla');
select public.salir_de_caja(t.id('casa'));
select t.ok((select count(*) from public.cajas where id = t.id('casa')) = 0, 'quien sale de una caja deja de verla');
select t.como('ana');
select t.ok((select tipo from public.cajas where id = t.id('casa')) = 'privada', 'la caja vuelve a privada si queda una sola persona');
select public.invitar_a_caja(t.id('casa'), 'beto');
select t.como('beto');
select public.responder_invitacion((select id from public.mis_invitaciones()), true);
select t.ok((select count(*) from public.cajas where id = t.id('casa')) = 1, 'una persona quitada puede volver con una nueva invitación');
select t.como('ana');
select set_config('t.inv_carla', public.invitar_a_caja(t.id('casa'), 'carla')::text, false);
select public.cancelar_invitacion(t.id('inv_carla'));
select t.como('carla');
select t.ok((select count(*) from public.mis_invitaciones()) = 0, 'una invitación cancelada desaparece');

-- ── invitación vencida ──
select t.admin();
select set_config('t.inv_vieja', (select public.invitar_a_caja(t.id('casa'), 'carla')::text from (select t.como('ana')) _), false);
select t.admin();
update public.invitaciones set expira_en = now() - interval '1 minute' where id = t.id('inv_vieja');
select t.como('carla');
select t.ok((select count(*) from public.mis_invitaciones()) = 0, 'una invitación vencida no se muestra');
select t.ok(public.responder_invitacion(t.id('inv_vieja'), true) is null, 'aceptar una vencida no da acceso');
select t.ok((select count(*) from public.cajas where id = t.id('casa')) = 0, 'Carla sigue sin acceso');

-- ── auditoría, perfiles, cotizaciones, archivado ──
select t.como('ana');
select t.ok((select count(*) from public.auditoria where caja_id = t.id('casa')) > 5, 'el dueño ve la auditoría de su caja');
select t.como('beto');
select t.ok((select count(*) from public.auditoria) = 0, 'un editor no ve la auditoría');
select t.como('ana');
update public.profiles set moneda_base = 'USD' where id = t.uid('ana');
select t.ok((select moneda_base from public.profiles where id = t.uid('ana')) = 'USD', 'cada uno elige su moneda principal');
select t.falla($$ update public.profiles set email = 'otro@x.com' where id = t.uid('ana') $$, 'permission denied', 'el email no se edita desde la API');
select t.falla($$ update public.profiles set moneda_base = 'JPY' where id = t.uid('ana') $$, 'violates foreign key', 'moneda base inválida');
do $$ declare n int; begin update public.profiles set nombre = 'Hack' where id = t.uid('beto'); get diagnostics n = row_count; perform t.ok(n = 0, 'no se edita el perfil de otra persona'); end $$;
select t.ok((select count(*) from public.tipos_cambio) = 6, 'las cotizaciones de referencia son legibles');
select t.falla($$ update public.tipos_cambio set por_usd = 1 $$, 'permission denied', 'las cotizaciones de referencia no se editan');
insert into public.tipos_cambio_usuario values (t.uid('ana'), 'ARS', 1600);
update public.tipos_cambio_usuario set por_usd = 1650 where moneda = 'ARS';
select t.como('beto');
select t.ok((select count(*) from public.tipos_cambio_usuario) = 0, 'la cotización propia es privada');
select t.falla($$ insert into public.tipos_cambio_usuario values (t.uid('ana'), 'EUR', 1) $$, 'row-level security', 'no se escriben cotizaciones a nombre de otro');
do $$ declare n int; begin update public.cajas set archivada = true where id = t.id('casa'); get diagnostics n = row_count; perform t.ok(n = 0, 'un editor no archiva la caja'); end $$;
select t.como('ana');
update public.cajas set archivada = true where id = t.id('casa');
select t.ok((select archivada from public.cajas where id = t.id('casa')), 'el dueño archiva');

-- ── funciones internas y rol anónimo ──
select t.falla($$ select public._crear_caja(t.uid('ana'), 'x', '#000000', 'ARS', null) $$, 'permission denied', 'las funciones internas no son invocables');
select t.falla($$ select public._avisar(t.uid('ana'), 'x', 'x') $$, 'permission denied', 'ni _avisar');
select t.falla($$ select public._auditar(null, 'x') $$, 'permission denied', 'ni _auditar');
reset role;
set role anon;
select t.falla($$ select * from public.cajas $$, 'permission denied', 'sin sesión no se lee nada');
select t.falla($$ select public.crear_caja('x', '#000000', 'ARS') $$, 'permission denied', 'sin sesión no se crea nada');
select t.falla($$ select * from public.profiles $$, 'permission denied', 'ni perfiles');
reset role;

-- ── sin sesión dentro de una función de la API ──
select t.admin();
set role authenticated;
select t.falla($$ select public.crear_caja('x', '#000000', 'ARS') $$, 'no_autenticado', 'con rol pero sin usuario, falla');
reset role;

\echo
\echo 'TODAS LAS PRUEBAS PASARON'
