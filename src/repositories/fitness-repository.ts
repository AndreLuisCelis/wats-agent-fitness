import { DadosAgua, DadosPassos, DadosTreino, RegistroTreino } from '../types/fitness.js';

export class FitnessRepository {
  constructor(private readonly db?: D1Database) {}

  public async salvarTreino(
    userId: string,
    dados: DadosTreino,
    calorias: number
  ): Promise<RegistroTreino | null> {
    if (!this.db) return null;

    const registro: RegistroTreino = {
      userId,
      tipo: dados.tipo,
      duracaoMinutos: dados.duracaoMinutos,
      calorias,
      data: new Date().toISOString()
    };

    await this.db.prepare(`
      INSERT INTO registros_treino
        (user_id, tipo, duracao_minutos, calorias, data)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      registro.userId,
      registro.tipo,
      registro.duracaoMinutos,
      registro.calorias,
      registro.data
    ).run();

    return registro;
  }

  public async salvarPassos(userId: string, dados: DadosPassos): Promise<void> {
    if (!this.db) return;

    await this.db.prepare(`
      INSERT INTO metricas_diarias (user_id, data, passos)
      VALUES (?, date('now'), ?)
      ON CONFLICT(user_id, data) DO UPDATE SET passos = metricas_diarias.passos + excluded.passos
    `).bind(userId, dados.quantidade).run();
  }

  public async salvarAgua(userId: string, dados: DadosAgua): Promise<void> {
    if (!this.db) return;

    await this.db.prepare(`
      INSERT INTO metricas_diarias (user_id, data, agua_ml)
      VALUES (?, date('now'), ?)
      ON CONFLICT(user_id, data) DO UPDATE SET agua_ml = metricas_diarias.agua_ml + excluded.agua_ml
    `).bind(userId, dados.quantidadeMl).run();
  }
}
