# Cajas — finanzas personales y colaborativas

Cajas privadas o compartidas (con cajitas adentro), cada una en su moneda (ARS, USD, EUR, BRL, UYU, CLP), con invitaciones que hay que aceptar, saldos entre miembros, presupuestos, movimientos mensuales y asistente de IA.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Supabase (Postgres + Auth + RLS) · Anthropic (opcional).

```
supabase/migrations   esquema, RLS, funciones (RPC) y cron
supabase/tests        168 pruebas de seguridad y reglas contra Postgres real
packages/core         lógica pura compartida (monedas, reparto, categorías, proyección) — 21 tests
apps/web              la aplicación web
```

## Puesta en marcha

1. **Supabase:** creá un proyecto en supabase.com.
2. **Base de datos:** `npx supabase link --project-ref <ref>` y `npx supabase db push` (aplica las migraciones de `supabase/migrations`; la última crea también el bucket público `avatars` para las fotos de perfil).
3. **Auth (importante para los mails):** en *Authentication → URL Configuration* poné la URL del sitio como *Site URL* y agregá `<URL>/**` a *Redirect URLs*. Después, en *Authentication → Emails → Templates*, cambiá el link de estas dos plantillas para que funcionen aunque el mail se abra en otro navegador o en el celular:
   - **Reset Password:** `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/restablecer">Elegir contraseña nueva</a>`
   - **Confirm signup:** `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/">Confirmar mi cuenta</a>`

   Configurá además un SMTP propio (*Project Settings → Authentication → SMTP*): el de prueba de Supabase permite muy pocos mails por hora.
4. **Variables:** copiá `apps/web/.env.example` a `apps/web/.env.local` y completá `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL`. `ANTHROPIC_API_KEY` es opcional: sin ella la app categoriza por reglas y responde con un resumen local.
5. **Local:** `npm install && npm run dev` → http://localhost:3000
6. **Producción:** importá el repo en Vercel con *Root Directory* `apps/web` y cargá las mismas variables.
7. **Movimientos mensuales:** la migración `..._cron.sql` los programa si `pg_cron` está activo (*Database → Extensions*). Si no, llamá a `select ejecutar_recurrentes();` una vez por día desde un cron propio con la clave `service_role`.

## Seguridad en una línea

Todas las tablas tienen RLS; el navegador solo puede leer lo que le corresponde y **toda escritura pasa por funciones SQL** que validan permisos y reglas (reparto que suma, miembro activo, rol). Quien recibe una invitación solo ve el nombre de la caja y quién invita hasta que acepta.

## Pruebas

- `npm test` — lógica del núcleo.
- `supabase/tests/run.sh` — pruebas de base de datos (requiere un Postgres 16 local; ver encabezado del script).
- `npm run build -w @cajas/web` — compilación y tipos.

## Pendientes y límites conocidos

- No se probó de punta a punta contra un proyecto Supabase real (no había credenciales); la base sí se probó en Postgres real y la web compila.
- Las cuentas que ya existían quedan sin nombre de usuario: al ingresar, la app les pide elegirlo antes de seguir.
- Las fotos de perfil están en un bucket público (se leen por URL); solo cada persona escribe en su propia carpeta.
- La app móvil (Expo) no está hecha; `packages/core` está listo para compartirse.
- `buscar_usuarios` y `username_disponible` permiten descubrir nombres de usuario (es lo esperado para poder invitar): aplicá límite de pedidos (rate limit) en producción.
- Las cotizaciones de `tipos_cambio` son valores de ejemplo: cargá las reales o dejá que cada persona use las suyas en Ajustes.
