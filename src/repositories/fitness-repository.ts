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

  public async buscarTreinos(userId: string, limite: number = 10): Promise<RegistroTreino[]> {
    if (!this.db) return [];

    const resultado = await this.db.prepare(`
      SELECT id, user_id AS userId, tipo, duracao_minutos AS duracaoMinutos, calorias, data
      FROM registros_treino
      WHERE user_id = ?
      ORDER BY data DESC
      LIMIT ?
    `).bind(userId, limite).all<RegistroTreino>();

    return resultado.results;
  }

  public async buscarAguaHoje(userId: string): Promise<number> {
    if (!this.db) return 0;

    const resultado = await this.db.prepare(`
      SELECT COALESCE(agua_ml, 0) AS aguaMl
      FROM metricas_diarias
      WHERE user_id = ? AND data = date('now')
    `).bind(userId).first<{ aguaMl: number }>();

    return resultado?.aguaMl ?? 0;
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
