import { Env } from './types/fitness.js';
import { FitnessRepository } from './repositories/fitness-repository.js';

/** Limites padrão — podem ser sobrescritos por variáveis do Worker (LIMITE_*) */
export const LIMITES_PADRAO = {
  mensagensPorMinuto: 12,
  mensagensPorDia: 300,
  chamadasIaPorDia: 60
} as const;

const hojeIso = (): string => new Date().toISOString().slice(0, 10);

export interface ResultadoLimite {
  permitido: boolean;
  motivo?: 'MINUTO' | 'DIA';
}

/**
 * Rate limiting do chat web por usuário, com contadores no D1.
 * Janela por minuto (anti-rajada) e por dia (anti-abuso).
 */
export async function verificarLimitesChat(env: Env, userId: string): Promise<ResultadoLimite> {
  if (!env.DB) return { permitido: true };

  const repository = new FitnessRepository(env.DB);
  const bucketMinuto = `m:${Math.floor(Date.now() / 60_000)}`;
  const bucketDia = `d:${hojeIso()}`;

  const limiteMinuto = Number(env.LIMITE_MSGS_MINUTO ?? LIMITES_PADRAO.mensagensPorMinuto);
  const mensagensNoMinuto = await repository.incrementarContador(`msg:${userId}`, bucketMinuto);
  if (mensagensNoMinuto > limiteMinuto) {
    return { permitido: false, motivo: 'MINUTO' };
  }

  const limiteDia = Number(env.LIMITE_MSGS_DIA ?? LIMITES_PADRAO.mensagensPorDia);
  const mensagensNoDia = await repository.incrementarContador(`msg:${userId}`, bucketDia);
  if (mensagensNoDia > limiteDia) {
    return { permitido: false, motivo: 'DIA' };
  }

  // Limpeza oportunista de buckets antigos (2% das requisições).
  if (Math.random() < 0.02) {
    await repository.limparContadoresAntigos();
  }

  return { permitido: true };
}

/** Consome uma unidade do orçamento diário de IA do usuário; false quando estourou. */
export async function consumirOrcamentoIA(env: Env, userId: string): Promise<boolean> {
  if (!env.DB || !userId) return true; // sem DB (ou canal sem userId) não há orçamento a controlar

  const repository = new FitnessRepository(env.DB);
  const limite = Number(env.LIMITE_IA_DIA ?? LIMITES_PADRAO.chamadasIaPorDia);
  const uso = await repository.incrementarContador(`ia:${userId}`, `d:${hojeIso()}`);

  if (uso > limite) {
    console.log(`[Limites] Usuário ${userId} atingiu o orçamento diário de IA (${uso}/${limite}).`);
    return false;
  }
  return true;
}