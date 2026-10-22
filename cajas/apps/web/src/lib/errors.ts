/** Traduce los códigos que devuelve la base de datos a mensajes para la persona. */
const MENSAJES: Record<string, string> = {
  sin_permiso: 'No tenés permiso para hacer eso en esta caja.',
  no_autenticado: 'Tu sesión venció. Volvé a ingresar.',
  no_encontrado: 'No encontramos eso. Puede que ya no exista.',
  nombre_invalido: 'Poné un nombre de hasta 60 caracteres.',
  moneda_invalida: 'Esa moneda no está disponible.',
  meta_invalida: 'La meta tiene que ser mayor a cero.',
  monto_invalido: 'Ingresá un monto mayor a cero.',
  descripcion_invalida: 'Escribí una descripción de hasta 120 caracteres.',
  fecha_invalida: 'Elegí una fecha válida.',
  tipo_invalido: 'Ese tipo de movimiento no es válido.',
  pagador_invalido: 'Quien pagó tiene que ser miembro de la caja.',
  divisiones_invalidas: 'La división no es válida. Tiene que sumar el total y solo incluir miembros de la caja.',
  email_no_registrado: 'Ese email todavía no tiene cuenta. Pedile que se registre primero.',
  es_tu_cuenta: 'Ese es tu propio email.',
  ya_es_miembro: 'Esa persona ya es miembro de la caja.',
  invitacion_pendiente: 'Ya hay una invitación pendiente para esa persona.',
  invitacion_no_valida: 'Esa invitación ya no está disponible.',
  rol_invalido: 'Ese permiso no es válido.',
  no_podes_quitarte: 'No podés quitarte a vos mismo de tu caja.',
  el_creador_no_puede_salir: 'Quien creó la caja no puede salir de ella.',
  pago_invalido: 'El pago no es válido: tienen que ser dos miembros distintos.',
  cajas_iguales: 'Elegí dos cajas distintas.',
  presupuesto_invalido: 'Revisá los presupuestos: los límites tienen que ser mayores a cero.',
  usuario_no_encontrado: 'No existe nadie con ese nombre de usuario. Revisá que esté bien escrito.',
  username_invalido: 'El nombre de usuario tiene de 3 a 20 letras minúsculas, números o guion bajo (_), y no puede ser uno reservado.',
  username_en_uso: 'Ese nombre de usuario ya lo tiene otra persona. Probá con otro.',
  subcaja_en_subcaja: 'Una cajita no puede tener otras cajitas adentro.',
  limite_subcajas: 'Llegaste al máximo de 30 cajitas en esta caja.',
  caja_principal_requerida: 'Las invitaciones se hacen desde la caja principal, no desde una cajita.',
  moneda_inmutable: 'La moneda de una caja no se puede cambiar.',
};

export function mensajeError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Algo salió mal. Probá de nuevo.';
  const raw = (error.message ?? '').trim();
  if (MENSAJES[raw]) return MENSAJES[raw] as string;
  if (/Invalid login credentials/i.test(raw)) return 'El email o la contraseña no son correctos.';
  if (/already registered|already been registered/i.test(raw)) return 'Ese email ya tiene una cuenta. Ingresá en lugar de registrarte.';
  if (/Password should be at least/i.test(raw)) return 'La contraseña tiene que tener al menos 8 caracteres.';
  if (/rate limit|too many/i.test(raw)) return 'Hiciste muchos intentos. Esperá unos minutos y probá de nuevo.';
  if (/Email not confirmed/i.test(raw)) return 'Falta confirmar tu email. Revisá tu bandeja de entrada.';
  if (/fetch|network/i.test(raw)) return 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.';
  return 'Algo salió mal. Probá de nuevo.';
}
