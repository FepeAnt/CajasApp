import type { Currency } from '@cajas/core';

export type Rol = 'owner' | 'editor' | 'viewer';
export type TxTipo = 'gasto' | 'ingreso' | 'transferencia' | 'traspaso_sal' | 'traspaso_ent';

export interface Profile {
  id: string;
  nombre: string;
  email: string;
  moneda_base: Currency;
  username: string | null;
  avatar_url: string | null;
}

export interface CajaResumen {
  id: string;
  nombre: string;
  color: string;
  moneda: Currency;
  tipo: 'privada' | 'compartida';
  meta_centavos: number | null;
  owner_id: string;
  archivada: boolean;
  created_at: string;
  fondos_centavos: number;
  miembros: number;
  padre_id: string | null;
  subcajas: number;
  /** Fondos propios más los de sus cajitas. */
  fondos_total_centavos: number;
}

export interface Miembro {
  user_id: string;
  rol: Rol;
  profiles: { nombre: string; email: string; username: string | null; avatar_url: string | null } | null;
}

export interface Tx {
  id: string;
  caja_id: string;
  tipo: TxTipo;
  monto_centavos: number;
  descripcion: string;
  categoria: string;
  categoria_confianza: number | null;
  fecha: string;
  pagada_por: string;
  creada_por: string;
  recurrente_id: string | null;
  par_id: string | null;
  divisiones: { user_id: string; monto_centavos: number }[];
  cajas?: { nombre: string; moneda: Currency; color: string } | null;
}

export interface Presupuesto {
  caja_id: string;
  categoria: string;
  limite_centavos: number;
}

export interface Recurrente {
  id: string;
  caja_id: string;
  creada_por: string;
  tipo: 'gasto' | 'ingreso';
  monto_centavos: number;
  descripcion: string;
  categoria: string;
  dia: number;
  activo: boolean;
}

export interface Invitacion {
  id: string;
  caja_nombre: string;
  por_nombre: string;
  por_username: string | null;
  por_avatar: string | null;
  nueva: boolean;
  rol: 'editor' | 'viewer';
  creada: string;
}

export interface Aviso {
  id: string;
  tipo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
}
