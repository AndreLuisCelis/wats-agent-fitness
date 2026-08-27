import { AnaliseIntencaoIA, Env, TipoTreino } from '../types/fitness.js';
import { FitnessRepository } from '../repositories/fitness-repository.js';

export class FitnessAgent {
  private env: Env;
  private agentName: string;
  private repository: FitnessRepository;

  constructor(env: Env, agentName: string = 'FitBot Pro') {
    this.env = env;
    this.agentName = agentName;
    this.repository = new FitnessRepository(env.DB);
  }

  public async processarMensagem(userId: string, mensagemTexto: string): Promise<string> {
    console.log(`[${this.agentName}] Recebida mensagem do usuário ${userId}: "${mensagemTexto}"`);

    const consultaLocal = this.identificarConsultaLocal(mensagemTexto);
    if (consultaLocal) {
      console.log(`[${this.agentName}] Consulta respondida por regras locais: ${consultaLocal}.`);
      if (consultaLocal === 'AGUA') return await this.consultarAguaHoje(userId);
      if (consultaLocal === 'PASSOS') return await this.consultarPassosHoje(userId);
      return await this.consultarRegistros(userId, consultaLocal === 'HOJE');
    }

    const analise = await this.interpretarComWorkersAI(mensagemTexto);

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

      case 'REGISTRAR_AGUA':
        if (analise.dadosAgua) {
          return await this.executarRegistroAgua(
            userId,
            analise.dadosAgua.quantidadeMl
          );
        }
        break;

      case 'REGISTRAR_ALIMENTO':
        if (analise.dadosAlimento) {
          return await this.executarRegistroAlimento(
            userId,
            analise.dadosAlimento.alimento,
            analise.dadosAlimento.quantidade,
            analise.dadosAlimento.unidade
          );
        }
        break;

      case 'CONSULTAR_REGISTROS':
        return await this.consultarRegistros(userId);

      case 'CONVERSA_GERAL':
      default:
        return analise.respostaTextual;
    }

    return "Não consegui entender completamente seus dados de treino. Pode informar algo como: 'Fiz 45 min de spinning' ou 'Dei 8000 passos'?";
  }

  private identificarConsultaLocal(texto: string): 'HOJE' | 'AGUA' | 'PASSOS' | 'TREINOS' | null {
    const consulta = texto.toLowerCase()
      .replace(/[áàâãä]/g, 'a')
      .replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o')
      .replace(/[úùûü]/g, 'u')
      .replace(/ç/g, 'c');

    if (consulta.includes('agua') && /(quanto|quanta|quantos|qual|como esta|como ficou)/.test(consulta)) {
      return 'AGUA';
    }

    if (consulta.includes('passo') && /(quantos|quantidade|dei|fiz|hoje)/.test(consulta)) {
      return 'PASSOS';
    }

    if (consulta.includes('o que registrei hoje') || consulta.includes('meus registros de hoje')
      || consulta.includes('historico de hoje') || consulta.includes('historico do dia')) {
      return 'HOJE';
    }

    if (consulta.includes('meus treinos') || consulta.includes('meu treino')
      || consulta.includes('meus registros') || consulta.includes('meu historico')) {
      return 'TREINOS';
    }

    return null;
  }

  private async interpretarComWorkersAI(texto: string): Promise<AnaliseIntencaoIA> {
    const systemPrompt = `
Você é o ${this.agentName}, um assistente virtual de fitness carismático, direto e motivador.
Sua tarefa é analisar a mensagem do usuário e extrair os dados em formato JSON válido.
Retorne APENAS um objeto JSON com o seguinte formato:
{
  "intencaoIdentificada": "REGISTRAR_TREINO" | "REGISTRAR_PASSOS" | "REGISTRAR_AGUA" | "REGISTRAR_ALIMENTO" | "CONSULTAR_REGISTROS" | "CONVERSA_GERAL",
  "dadosTreino": { "tipo": "SPINNING" | "CALISTHENICS" | "WEIGHTLIFTING" | "WALKING" | "RUNNING" | "OTHER", "duracaoMinutos": number },
  "dadosPassos": { "quantidade": number },
  "dadosAgua": { "quantidadeMl": number },
  "dadosAlimento": { "alimento": string, "quantidade": number, "unidade": string },
  "respostaTextual": "Sua mensagem motivacional aqui"
}
    `;

    try {
      const aiResponse: any = await this.env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: texto }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            type: 'object',
            properties: {
              intencaoIdentificada: {
                type: 'string',
                enum: ['REGISTRAR_TREINO', 'REGISTRAR_PASSOS', 'REGISTRAR_AGUA', 'REGISTRAR_ALIMENTO', 'CONSULTAR_REGISTROS', 'CONVERSA_GERAL']
              },
              dadosTreino: {
                type: 'object',
                properties: {
                  tipo: { type: 'string', enum: ['SPINNING', 'CALISTHENICS', 'WEIGHTLIFTING', 'WALKING', 'RUNNING', 'OTHER'] },
                  duracaoMinutos: { type: 'number' }
                }
              },
              dadosPassos: {
                type: 'object',
                properties: { quantidade: { type: 'number' } }
              },
              dadosAgua: {
                type: 'object',
                properties: { quantidadeMl: { type: 'number' } }
              },
              dadosAlimento: {
                type: 'object',
                properties: {
                  alimento: { type: 'string' },
                  quantidade: { type: 'number' },
                  unidade: { type: 'string' }
                },
                required: ['alimento', 'quantidade']
              },
              respostaTextual: { type: 'string' }
            },
            required: ['intencaoIdentificada', 'respostaTextual']
          }
        }
      });

      const resposta = aiResponse?.response;
      const rawText = typeof resposta === 'string' ? resposta : '';
      let pensamento = '';
      let jsonClean: unknown = resposta;

      if (rawText && rawText.includes('</think>')) {
        const parts = rawText.split('</think>');
        pensamento = parts[0].replace('<think>', '').trim();
        jsonClean = parts[1] ? parts[1].trim() : parts[0].trim();
      }

      if (typeof jsonClean === 'string') {
        jsonClean = jsonClean.replace(/```json/g, '').replace(/```/g, '').trim();
        jsonClean = JSON.parse(jsonClean as string);
      }

      const parsed = this.validarAnalise(jsonClean);
      parsed.pensamentoIa = pensamento;
      console.log(`[${this.agentName}] Resposta estruturada recebida do Workers AI.`);

      return parsed;
    } catch (error) {
      console.error('Erro ao executar Workers AI, usando fallback heurístico:', error);
      return this.fallbackHeuristico(texto);
    }
  }

  private validarAnalise(valor: unknown): AnaliseIntencaoIA {
    if (!valor || typeof valor !== 'object') {
      throw new Error('Workers AI não retornou um objeto estruturado.');
    }

    const analise = valor as Partial<AnaliseIntencaoIA>;
    const intencoes = ['REGISTRAR_TREINO', 'REGISTRAR_PASSOS', 'REGISTRAR_AGUA', 'REGISTRAR_ALIMENTO', 'CONSULTAR_REGISTROS', 'CONVERSA_GERAL'];
    if (!intencoes.includes(analise.intencaoIdentificada ?? '') || typeof analise.respostaTextual !== 'string') {
      throw new Error('Resposta do Workers AI fora do contrato esperado.');
    }

    return analise as AnaliseIntencaoIA;
  }

  private fallbackHeuristico(texto: string): AnaliseIntencaoIA {
    const t = texto.toLowerCase();

    if (t.includes('registro') || t.includes('histórico') || t.includes('historico') || t.includes('treinos')) {
      return {
        intencaoIdentificada: 'CONSULTAR_REGISTROS',
        respostaTextual: 'Vou consultar seus registros.'
      };
    }

    if (t.includes('passo') || t.includes('caminhei') || t.includes('caminhada')) {
      const quantidadeInformada = t.match(/([\d.,]+)\s*(?:mil\s*)?passos?/);
      const valorTexto = quantidadeInformada?.[1]?.replace(/\./g, '').replace(',', '.');
      const quantidadeBase = valorTexto ? Number(valorTexto) : 0;
      const quantidade = t.includes('mil') ? quantidadeBase * 1000 : quantidadeBase;

      if (quantidade > 0) {
        return {
          intencaoIdentificada: 'REGISTRAR_PASSOS',
          dadosPassos: { quantidade: Math.round(quantidade) },
          respostaTextual: 'Passos registrados!'
        };
      }
    }

    if (t.includes('água') || t.includes('agua') || t.includes('hidrata') || /[\d.,]+\s*(?:ml|mililitros?|l|litros?)/.test(t)) {
      const quantidadeInformada = t.match(/([\d.,]+)\s*(?:ml|mililitros?|l|litros?)/);
      const valorTexto = quantidadeInformada?.[1]?.replace(',', '.');
      const valor = valorTexto ? Number(valorTexto) : 0;
      const quantidadeMl = quantidadeInformada?.[0].includes('l') && !quantidadeInformada[0].includes('ml')
        ? valor * 1000
        : valor;

      if (quantidadeMl > 0) {
        return {
          intencaoIdentificada: 'REGISTRAR_AGUA',
          dadosAgua: { quantidadeMl: Math.round(quantidadeMl) },
          respostaTextual: 'Hidratação registrada!'
        };
      }
    }

    if (t.includes('comi') || t.includes('comer') || t.includes('comemos') || t.includes('comida')
        || t.includes('aliment') || t.includes('refeição') || t.includes('refeicao')
        || t.includes('lanche') || t.includes('pão') || t.includes('pao')) {
      const numero = t.match(/(\d+(?:[.,]\d+)?)/);
      const quantidade = numero ? Number(numero[1].replace(',', '.')) : 1;

      let alimentoTexto = texto
        .replace(/\b(?:comi|comer|comemos|comida|alimento|alimentação|alimentacao|refeição|refeicao|lanche)\b/gi, '')
        .replace(/(\d+(?:[.,]\d+)?)/g, '')
        .replace(/[.,;:!?]/g, '')
        .trim();

      if (!alimentoTexto) {
        alimentoTexto = 'alimento';
      }

      return {
        intencaoIdentificada: 'REGISTRAR_ALIMENTO',
        dadosAlimento: { alimento: alimentoTexto, quantidade },
        respostaTextual: 'Alimentação registrada via contingência!'
      };
    }

    if (t.includes('spinning') || t.includes('treino') || t.includes('calistenia')) {
      let tipo: TipoTreino = 'OTHER';
      if (t.includes('spinning')) tipo = 'SPINNING';
      if (t.includes('calistenia')) tipo = 'CALISTHENICS';
      const duracaoInformada = t.match(/(\d+)\s*(?:min|minuto|minutos)/);
      const duracaoMinutos = duracaoInformada ? Number(duracaoInformada[1]) : 40;

      return {
        intencaoIdentificada: 'REGISTRAR_TREINO',
        dadosTreino: { tipo, duracaoMinutos },
        respostaTextual: 'Treino registrado via contingência!'
      };
    }

    return {
      intencaoIdentificada: 'CONVERSA_GERAL',
      respostaTextual: 'Olá! Sou seu assistente de fitness. Como foi seu treino hoje?'
    };
  }

  private async consultarRegistros(userId: string, apenasHoje: boolean = false): Promise<string> {
    const [registros, aguaHoje, alimentos] = await Promise.all([
      this.repository.buscarTreinos(userId, 10, apenasHoje),
      this.repository.buscarAguaHoje(userId),
      this.repository.buscarAlimentos(userId, 10, apenasHoje)
    ]);

    if (registros.length === 0 && aguaHoje === 0 && alimentos.length === 0) {
      return 'Ainda não encontrei registros para este usuário. Registre uma atividade (treino, passos, água ou alimentação) e tente consultar novamente.';
    }

    const secoes: string[] = [];

    if (registros.length > 0) {
      const linhas = registros.map((registro, indice) => {
        const data = new Date(registro.data).toLocaleString('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short'
        });
        return `${indice + 1}. ${registro.tipo} - ${registro.duracaoMinutos} min - ~${registro.calorias} kcal (${data})`;
      });
      const totalCalorias = registros.reduce((total, registro) => total + registro.calorias, 0);

      secoes.push(
        `Seus ${registros.length} registros de treino mais recentes:\n` +
        `${linhas.join('\n')}\n\n` +
        `Total estimado nesse período: ~${totalCalorias} kcal.`
      );
    }

    if (alimentos.length > 0) {
      const linhas = alimentos.map((registro, indice) => {
        const data = new Date(registro.data).toLocaleString('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short'
        });
        const unidade = registro.unidade ? ` ${registro.unidade}` : '';
        return `${indice + 1}. ${registro.alimento} - ${registro.quantidade}${unidade} - ~${registro.calorias} kcal (${data})`;
      });
      const totalCalorias = alimentos.reduce((total, registro) => total + registro.calorias, 0);

      secoes.push(
        `🍽️ Seus ${alimentos.length} registros de alimentação mais recentes:\n` +
        `${linhas.join('\n')}\n\n` +
        `Total estimado nesse período: ~${totalCalorias} kcal.`
      );
    }

    if (aguaHoje > 0) {
      const metaMl = 2000;
      const percentual = Math.min(Math.round((aguaHoje / metaMl) * 100), 100);
      secoes.push(
        `💧 Água consumida hoje: ${aguaHoje.toLocaleString('pt-BR')} ml de ${metaMl.toLocaleString('pt-BR')} ml (${percentual}%).`
      );
    }

    return secoes.join('\n\n');
  }

  private async consultarAguaHoje(userId: string): Promise<string> {
    const aguaHoje = await this.repository.buscarAguaHoje(userId);
    const metaMl = 2000;
    const percentual = Math.min(Math.round((aguaHoje / metaMl) * 100), 100);

    return aguaHoje > 0
      ? `Você já bebeu ${aguaHoje.toLocaleString('pt-BR')} ml de água hoje (${percentual}% da meta de ${metaMl.toLocaleString('pt-BR')} ml).`
      : 'Você ainda não registrou consumo de água hoje.';
  }

  private async consultarPassosHoje(userId: string): Promise<string> {
    const passosHoje = await this.repository.buscarPassosHoje(userId);
    const meta = 7000;
    const percentual = Math.min(Math.round((passosHoje / meta) * 100), 100);

    return passosHoje > 0
      ? `Você deu ${passosHoje.toLocaleString('pt-BR')} passos hoje (${percentual}% da meta de ${meta.toLocaleString('pt-BR')}).`
      : 'Você ainda não registrou passos hoje.';
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

    await this.repository.salvarTreino(userId, {
      tipo,
      duracaoMinutos: duracao
    }, calorias);

    return `💪 **Excelente Treino Registrado!**\n` +
      `• **Modalidade:** ${tipo}\n` +
      `• **Duração:** ${duracao} minutos\n` +
      `• **Gasto Estimado:** ~${calorias} kcal\n\n` +
      `A disciplina supera a motivação. Parabéns pelo esforço de hoje! 🔥`;
  }

  private async executarRegistroPassos(userId: string, quantidade: number): Promise<string> {
    const meta = 7000;
    await this.repository.salvarPassos(userId, { quantidade });
    const pct = Math.min(Math.round((quantidade / meta) * 100), 100);
    const barra = '▓'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));

    return `🏃 **Passos do Dia Registrados!**\n` +
      `• **Progresso:** ${quantidade.toLocaleString('pt-BR')} / ${meta.toLocaleString('pt-BR')} passos\n` +
      `• **Status:** ${pct}%\n` +
      `[${barra}]\n\n` +
      (pct >= 100 ? `🎉 Meta diária batida! Excelente mobilidade!` : `Faltam ${meta - quantidade} passos para a meta!`);
  }

  private async executarRegistroAgua(userId: string, quantidadeMl: number): Promise<string> {
    const metaMl = 2000;
    await this.repository.salvarAgua(userId, { quantidadeMl });
    const percentual = Math.min(Math.round((quantidadeMl / metaMl) * 100), 100);

    return `💧 **Água Registrada!**\n` +
      `• **Quantidade:** ${quantidadeMl.toLocaleString('pt-BR')} ml\n` +
      `• **Progresso:** ${percentual}% da meta diária de ${metaMl.toLocaleString('pt-BR')} ml\n\n` +
      (percentual >= 100 ? `🎉 Meta de hidratação atingida!` : `Faltam ${(metaMl - quantidadeMl).toLocaleString('pt-BR')} ml para a meta!`);
  }

  private async executarRegistroAlimento(
    userId: string,
    alimento: string,
    quantidade: number,
    unidade?: string
  ): Promise<string> {
    const kcalPorUnidade = this.estimarKcalAlimento(alimento);
    const calorias = Math.round(quantidade * kcalPorUnidade);

    await this.repository.salvarAlimento(userId, { alimento, quantidade, unidade }, calorias);

    return `🍽️ **Consumo Registrado!**\n` +
      `• **Alimento:** ${alimento}${unidade ? ` (${unidade})` : ''}\n` +
      `• **Quantidade:** ${quantidade}\n` +
      `• **Calorias estimadas:** ~${calorias} kcal\n\n` +
      `Registro salvo! Continue cuidando da sua alimentação. 💚`;
  }

  private estimarKcalAlimento(alimento: string): number {
    const a = alimento.toLowerCase();

    const mapa: Record<string, number> = {
      'pão francês': 135,
      'pão': 130,
      'pao': 130,
      'pães': 130,
      'paes': 130,
      'arroz': 130,
      'feijão': 55,
      'feijao': 55,
      'frango': 165,
      'carne': 250,
      'peixe': 200,
      'ovo': 70,
      'queijo': 120,
      'presunto': 40,
      'banana': 90,
      'maçã': 70,
      'maca': 70,
      'laranja': 60,
      'abacate': 160,
      'batata': 80,
      'macarrão': 200,
      'macarrao': 200,
      'pizza': 270,
      'lasanha': 200,
      'salada': 50,
      'suco': 90,
      'refrigerante': 130,
      'cerveja': 150
    };

    for (const [chave, kcal] of Object.entries(mapa)) {
      if (a.includes(chave)) return kcal;
    }

    return 100;
  }
}