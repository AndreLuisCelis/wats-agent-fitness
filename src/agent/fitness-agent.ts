import { AnaliseIntencaoIA, Env, RegistroTreino, TipoTreino } from '../types/fitness.js';

export class FitnessAgent {
  private env: Env;
  private agentName: string;

  constructor(env: Env, agentName: string = 'FitBot Pro') {
    this.env = env;
    this.agentName = agentName;
  }

  /**
   * Processa a mensagem do usuário do WhatsApp utilizando Workers AI
   */
  public async processarMensagem(userId: string, mensagemTexto: string): Promise<string> {
    console.log(`[${this.agentName}] Recebida mensagem do usuário ${userId}: "${mensagemTexto}"`);

    // 1. Executa a inferência de IA para interpretar intenção e extrair dados
    const analise = await this.interpretarComWorkersAI(mensagemTexto);

    // 2. Executa a ação de acordo com a intenção
    switch (analise.intencaoIdentificada) {
      case 'REGISTRAR_TREINO':
        if (analise.dadosTreino) {
          return await this.executarRegistroTreino(
            userId,
            analise.dadosTreino.tipo,
            analise.dadosTreino.duracaoMinutos
          );
        }
        break;

      case 'REGISTRAR_PASSOS':
        if (analise.dadosPassos) {
          return await this.executarRegistroPassos(
            userId,
            analise.dadosPassos.quantidade
          );
        }
        break;

      case 'CONVERSA_GERAL':
      default:
        return analise.respostaTextual;
    }

    return "Não consegui entender completamente seus dados de treino. Pode informar algo como: 'Fiz 45 min de spinning' ou 'Dei 8000 passos'?";
  }

  /**
   * Faz a chamada ao Cloudflare Workers AI utilizando um modelo de Raciocínio (Think)
   */
  private async interpretarComWorkersAI(texto: string): Promise<AnaliseIntencaoIA> {
    const systemPrompt = `
Você é o ${this.agentName}, um assistente virtual de fitness carismático, direto e motivador.
Sua tarefa é analisar a mensagem do usuário e extrair os dados em formato JSON válido.
Retorne APENAS um objeto JSON com o seguinte formato:
{
  "intencaoIdentificada": "REGISTRAR_TREINO" | "REGISTRAR_PASSOS" | "CONVERSA_GERAL",
  "dadosTreino": { "tipo": "SPINNING" | "CALISTHENICS" | "WEIGHTLIFTING" | "WALKING" | "OTHER", "duracaoMinutos": number },
  "dadosPassos": { "quantidade": number },
  "respostaTextual": "Sua mensagem motivacional aqui"
}
    `;

    try {
      // Executa a inferência no Cloudflare Workers AI
      const aiResponse: any = await this.env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: texto }
        ]
      });

      const rawText = aiResponse.response || '';

      // Separa o raciocínio <think> da resposta JSON
      let pensamento = '';
      let jsonClean = rawText;

      if (rawText.includes('</think>')) {
        const parts = rawText.split('</think>');
        pensamento = parts[0].replace('<think>', '').trim();
        jsonClean = parts[1] ? parts[1].trim() : parts[0].trim();
      }

      // Remove formatações markdown de código se houver (```json ... ```)
      jsonClean = jsonClean.replace(/```json/g, '').replace(/```/g, '').trim();

      const parsed: AnaliseIntencaoIA = JSON.parse(jsonClean);
      parsed.pensamentoIa = pensamento;

      return parsed;
    } catch (error) {
      console.error('Erro ao executar Workers AI, usando fallback heurístico:', error);
      return this.fallbackHeuristico(texto);
    }
  }

  /**
   * Regra de contingência caso a API de IA falhe
   */
  private fallbackHeuristico(texto: string): AnaliseIntencaoIA {
    const t = texto.toLowerCase();

    if (t.includes('spinning') || t.includes('treino') || t.includes('calistenia')) {
      let tipo: TipoTreino = 'OTHER';
      if (t.includes('spinning')) tipo = 'SPINNING';
      if (t.includes('calistenia')) tipo = 'CALISTHENICS';

      return {
        intencaoIdentificada: 'REGISTRAR_TREINO',
        dadosTreino: { tipo, duracaoMinutos: 40 },
        respostaTextual: 'Treino registrado via contingência!'
      };
    }

    return {
      intencaoIdentificada: 'CONVERSA_GERAL',
      respostaTextual: 'Olá! Sou seu assistente de fitness. Como foi seu treino hoje?'
    };
  }

  private async executarRegistroTreino(userId: string, tipo: TipoTreino, duracao: number): Promise<string> {
    const fatoresKcal: Record<TipoTreino, number> = {
      SPINNING: 10.5,
      CALISTHENICS: 8.0,
      WEIGHTLIFTING: 6.0,
      WALKING: 4.5,
      RUNNING: 11.0,
      OTHER: 5.5
    };

    const calorias = Math.round(duracao * (fatoresKcal[tipo] || 5.0));

    return `💪 **Excelente Treino Registrado!**\n` +
      `• **Modalidade:** ${tipo}\n` +
      `• **Duração:** ${duracao} minutos\n` +
      `• **Gasto Estimado:** ~${calorias} kcal\n\n` +
      `A disciplina supera a motivação. Parabéns pelo esforço de hoje! 🔥`;
  }

  private async executarRegistroPassos(userId: string, quantidade: number): Promise<string> {
    const meta = 7000;
    const pct = Math.min(Math.round((quantidade / meta) * 100), 100);
    const barra = '▓'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));

    return `🏃 **Passos do Dia Registrados!**\n` +
      `• **Progresso:** ${quantidade.toLocaleString('pt-BR')} / ${meta.toLocaleString('pt-BR')} passos\n` +
      `• **Status:** ${pct}%\n` +
      `[${barra}]\n\n` +
      (pct >= 100 ? `🎉 Meta diária batida! Excelente mobilidade!` : `Faltam ${meta - quantidade} passos para a meta!`);
  }
}