-- Metas de ahorro editables en cualquier momento, también por quienes pueden cargar movimientos.

create function public.definir_meta(p_caja uuid, p_meta bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := public._uid();
begin
  if not public.puede_escribir(p_caja, v) then perform public._err('sin_permiso'); end if;
  if p_meta is not null and p_meta <= 0 then perform public._err('meta_invalida'); end if;
  update public.cajas set meta_centavos = p_meta where id = p_caja;
  if not found then perform public._err('no_encontrado'); end if;
  perform public._auditar(public._raiz(p_caja), 'meta', jsonb_build_object('caja', p_caja, 'meta', p_meta));
end $$;

revoke all on function public.definir_meta(uuid, bigint) from public, anon, authenticated;
grant execute on function public.definir_meta(uuid, bigint) to authenticated;

-- La caja grande también muestra la suma de las metas de sus cajitas.
create or replace view public.cajas_resumen with (security_invoker = true) as
select c.id, c.nombre, c.color, c.moneda, c.tipo, c.meta_centavos, c.owner_id, c.archivada, c.created_at,
       own.f as fondos_centavos,
       (select count(*) from public.caja_miembros m where m.caja_id = coalesce(c.padre_id, c.id) and m.estado = 'activo')::int as miembros,
       c.padre_id,
       (select count(*) from public.cajas h where h.padre_id = c.id)::int as subcajas,
       (own.f + coalesce((select sum(case when t.tipo in ('ingreso','traspaso_ent') then t.monto_centavos
                                          when t.tipo in ('gasto','traspaso_sal') then -t.monto_centavos else 0 end)
                            from public.cajas h join public.transacciones t on t.caja_id = h.id
                           where h.padre_id = c.id), 0))::bigint as fondos_total_centavos,
       coalesce((select sum(h.meta_centavos) from public.cajas h where h.padre_id = c.id), 0)::bigint as subcajas_meta_centavos
  from public.cajas c
 cross join lateral (
   select coalesce(sum(case when t.tipo in ('ingreso','traspaso_ent') then t.monto_centavos
                            when t.tipo in ('gasto','traspaso_sal') then -t.monto_centavos else 0 end), 0)::bigint as f
     from public.transacciones t where t.caja_id = c.id) own;
