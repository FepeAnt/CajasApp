-- Tarea diaria que genera los movimientos recurrentes del mes.
-- Se activa solo si la extensión pg_cron está habilitada (Supabase: Database → Extensions → pg_cron).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('cajas-recurrentes', '5 3 * * *', 'select public.ejecutar_recurrentes()');
  else
    raise notice 'pg_cron no está habilitada: ejecutá public.ejecutar_recurrentes() desde un job del servidor.';
  end if;
end $$;
