import { AnaliseIntencaoIA, Env, RespostaAgente, TipoTreino } from '../types/fitness.js';
import { FitnessRepository } from '../repositories/fitness-repository.js';
import { consumirOrcamentoIA } from '../limites.js';

/** Opções de execução do agente por requisição. */
export interface OpcoesAgente {
  /** Usuário autenticado (usado no orçamento de IA). Obrigatório para consumir orçamento. */
  userId?: string;
  /** Quando false, o agente responde apenas com regras locais/heurísticas (modo econômico). */
  usarIA?: boolean;
}

const MODELO_IA = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b';
const TIMEOUT_IA_MS = 15_000;

export class FitnessAgent {
  private env: Env;
  private agentName: string;
  private repository: FitnessRepository;
  private opcoes: OpcoesAgente;

  constructor(env: Env, agentName: string = 'FitBot Pro', opcoes: OpcoesAgente = {}) {
    this.env = env;
    this.agentName = agentName;
    this.opcoes = opcoes;
    this.repository = new FitnessRepository(env.DB);
  }

  public async processarMensagem(userId: string, mensagemTexto: string): Promise<RespostaAgente> {
    console.log(`[${this.agentName}] Recebida mensagem do usuário ${userId}: "${mensagemTexto}"`);

    const consultaLocal = this.identificarConsultaLocal(mensagemTexto);
    if (consultaLocal) {
      console.log(`[${this.agentName}] Consulta respondida por regras locais: ${consultaLocal}.`);
      if (consultaLocal === 'AGUA') return { resposta: await this.consultarAguaHoje(userId) };
      if (consultaLocal === 'PASSOS') return { resposta: await this.consultarPassosHoje(userId) };
      if (consultaLocal === 'ALIMENTACAO') return { resposta: await this.consultarAlimentacao(userId, /hoje/.test(mensagemTexto)) };
      if (consultaLocal === 'EXERCICIOS') return { resposta: await this.consultarTreinos(userId, /hoje/.test(mensagemTexto)) };
      if (consultaLocal === 'HOJE') return { resposta: await this.consultarRegistros(userId, true) };
      return { resposta: await this.consultarRegistros(userId) };
    }

    // Regras locais de registro: mensagens estruturadas comuns são gravadas
    // direto no D1, sem depender (ou consumir orçamento) do Workers AI.
    const registroLocal = this.interpretarRegistroLocal(mensagemTexto);
    if (registroLocal) {
      console.log(`[${this.agentName}] Registro identificado por regras locais: ${registroLocal.intencaoIdentificada}.`);
      return this.executarAnalise(userId, registroLocal);
    }

    const analise = await this.interpretarComWorkersAI(mensagemTexto);
    return this.executarAnalise(userId, analise);
  }

  /** Aplica a intenção analisada aos handlers de registro/consulta. */
  private async executarAnalise(userId: string, analise: AnaliseIntencaoIA): Promise<RespostaAgente> {
    switch (analise.intencaoIdentificada) {
      case 'REGISTRAR_TREINO':
        if (analise.dadosTreino) {
          return {
            resposta: await this.executarRegistroTreino(
              userId,
              analise.dadosTreino.tipo,
              analise.dadosTreino.duracaoMinutos
            )
          };
        }
        break;

      case 'REGISTRAR_PASSOS':
        if (analise.dadosPassos) {
          return {
            resposta: await this.executarRegistroPassos(
              userId,
              analise.dadosPassos.quantidade
            )
          };
        }
        break;

      case 'REGISTRAR_AGUA':
        if (analise.dadosAgua) {
          return {
            resposta: await this.executarRegistroAgua(
              userId,
              analise.dadosAgua.quantidadeMl
            )
          };
        }
        break;

      case 'REGISTRAR_ALIMENTO':
        if (analise.dadosAlimento) {
          return {
            resposta: await this.executarRegistroAlimento(
              userId,
              analise.dadosAlimento.alimento,
              analise.dadosAlimento.quantidade,
              analise.dadosAlimento.unidade
            )
          };
        }
        break;

      case 'CONSULTAR_REGISTROS':
        return { resposta: await this.consultarRegistros(userId) };

      case 'CONVERSA_GERAL':
      default:
        return { resposta: analise.respostaTextual, sugestoes: this.sugestoesPadrao() };
    }

    return {
      resposta: "Não consegui entender completamente seus dados de treino. Pode informar algo como: 'Fiz 45 min de spinning' ou 'Dei 8000 passos'?",
      sugestoes: this.sugestoesPadrao()
    };
  }

  /** Atalhos exibidos pelo cliente web em respostas de conversa geral. */
  private sugestoesPadrao(): string[] {
    return [
      'Fiz 30 min de corrida',
      'Bebi 500 ml de água',
      'Comi 2 bananas',
      'O que comi hoje?',
      'Meus registros'
    ];
  }

  /**
   * Reconhece registros estruturados comuns (água, passos, alimentação e treino)
   * por regras de texto — sem chamar o Workers AI. Retorna null quando não há
   * um registro claro na mensagem, deixando a decisão para a IA.
   */
  private interpretarRegistroLocal(texto: string): AnaliseIntencaoIA | null {
    const consulta = texto.toLowerCase()
      .replace(/[áàâãä]/g, 'a')
      .replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o')
      .replace(/[úùûü]/g, 'u')
      .replace(/ç/g, 'c');

    // Água: "bebi 500 ml de água", "tomei 2 litros de água"
    if (/\b(bebi|tomei)\b/.test(consulta)) {
      const medida = consulta.match(/(\d+(?:[.,]\d+)?)\s*(ml|mililitros?|l\b|litros?)/);
      if (medida) {
        const valor = Number(medida[1].replace(',', '.'));
        const quantidadeMl = Math.round(/^l/.test(medida[2]) ? valor * 1000 : valor);
        if (quantidadeMl > 0) {
          return { intencaoIdentificada: 'REGISTRAR_AGUA', dadosAgua: { quantidadeMl }, respostaTextual: 'Hidratação registrada!' };
        }
      }
    }

    // Passos: "dei 8 mil passos", "andei 6000 passos"
    if (/\bpassos?\b/.test(consulta)) {
      const medida = consulta.match(/(\d+(?:[.,]\d+)?)\s*(mil\s*)?passos?/);
      if (medida) {
        const base = Number(medida[1].replace(/\./g, '').replace(',', '.'));
        const quantidade = Math.round(medida[2] ? base * 1000 : base);
        if (quantidade > 0) {
          return { intencaoIdentificada: 'REGISTRAR_PASSOS', dadosPassos: { quantidade }, respostaTextual: 'Passos registrados!' };
        }
      }
    }

    // Alimentação: "comi 2 bananas", "comer 1 pão"
    if (/\b(comi|comemos|comer|almocei|jantei|lanchei)\b/.test(consulta)) {
      const numero = consulta.match(/(\d+(?:[.,]\d+)?)/);
      const quantidade = numero ? Number(numero[1].replace(',', '.')) : 1;
      let alimentoTexto = texto
        .replace(/\b(?:comi|comemos|comer|almocei|jantei|lanchei|alimento|alimentação|alimentacao|refeição|refeicao|lanche)\b/gi, '')
        .replace(/(\d+(?:[.,]\d+)?)/g, '')
        .replace(/[.,;:!?]/g, '')
        .trim();
      if (!alimentoTexto) alimentoTexto = 'alimento';
      return { intencaoIdentificada: 'REGISTRAR_ALIMENTO', dadosAlimento: { alimento: alimentoTexto, quantidade }, respostaTextual: 'Alimentação registrada!' };
    }

    // Treino: "fiz 30 min de corrida", "treinei 1 hora de musculação", "corri 5 km"
    const verboDeRegistro = /\b(fiz|treinei|corri|caminhei|pedalei|nadei|malhei|completei)\b/.test(consulta);
    if (verboDeRegistro) {
      const duracao = consulta.match(/(\d+(?:[.,]\d+)?)\s*(min(?:uto)?s?|h(?:ora)?s?)/);
      const distancia = consulta.match(/(\d+(?:[.,]\d+)?)\s*km\b/);

      if (duracao || distancia) {
        let duracaoMinutos = 40;
        if (duracao) {
          const valor = Number(duracao[1].replace(',', '.'));
          duracaoMinutos = Math.round(/^h/.test(duracao[2]) ? valor * 60 : valor);
        } else if (distancia) {
          const km = Number(distancia[1].replace(',', '.'));
          duracaoMinutos = Math.round(km * 10);
        }

        let tipo: TipoTreino = 'OTHER';
        if (/corrid|corri|correr/.test(consulta)) tipo = 'RUNNING';
        else if (/caminh/.test(consulta)) tipo = 'WALKING';
        else if (/spinning|pedal|biciclet|bike|ciclism/.test(consulta)) tipo = 'SPINNING';
        else if (/muscula|pesos?\b|academia|halter|levantament/.test(consulta)) tipo = 'WEIGHTLIFTING';
        else if (/calistenia|alonga|flexion/.test(consulta)) tipo = 'CALISTHENICS';

        return { intencaoIdentificada: 'REGISTRAR_TREINO', dadosTreino: { tipo, duracaoMinutos }, respostaTextual: 'Treino registrado!' };
      }
    }

    return null;
  }

  private identificarConsultaLocal(texto: string): 'HOJE' | 'AGUA' | 'PASSOS' | 'ALIMENTACAO' | 'EXERCICIOS' | 'GERAL' | null {
    const consulta = texto.toLowerCase()
      .replace(/[áàâãä]/g, 'a')
      .replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o')
      .replace(/[úùûü]/g, 'u')
      .replace(/ç/g, 'c');

    const intencaoDeAcao = /(quero|vou|preciso)\s+(registrar|anotar|marcar|comer|beber|treinar|malhar|caminhar|correr)/.test(consulta);
    const registraPassos = /(\d+(?:[.,]\d+)?)\s*(?:mil\s*)?passos/.test(consulta);
    const registraTreino = /(\d+(?:[.,]\d+)?)\s*(?:min\b|minuto|minutos|hora|horas|km\b)/.test(consulta);

    if (!intencaoDeAcao && consulta.includes('agua') && /(quanto|quanta|quantos|qual|como esta|como ficou)/.test(consulta)) {
      return 'AGUA';
    }

    if (!intencaoDeAcao && !registraPassos && consulta.includes('passo')
      && /(quantos|quantidade|quanto|quanta|qual|como esta|como ficou|hoje|meus)/.test(consulta)) {
      return 'PASSOS';
    }

    if (!intencaoDeAcao
      && (consulta.includes('comi') || consulta.includes('alimenta') || consulta.includes('alimento')
        || consulta.includes('comida') || consulta.includes('refeicao') || consulta.includes('caloria'))
      && /(quanto|quanta|quantas|quantos|o que|oque|qual|quais|como esta|como ficou|meus|meu|minha|minhas|registros)/.test(consulta)) {
      return 'ALIMENTACAO';
    }

    if (!intencaoDeAcao && !registraTreino
      && (consulta.includes('treino') || consulta.includes('treinei') || consulta.includes('exercicio')
        || consulta.includes('atividade fisica'))
      && /(quanto|quantos|quantas|qual|quais|o que|oque|como esta|como ficou|meus|meu|hoje|registros)/.test(consulta)) {
      return 'EXERCICIOS';
    }

    if (consulta.includes('o que registrei hoje') || consulta.includes('meus registros de hoje')
      || consulta.includes('historico de hoje') || consulta.includes('historico do dia')
      || consulta.includes('registros de hoje')) {
      return 'HOJE';
    }

    if (consulta.includes('meus registros') || consulta.includes('meu historico') || consulta.includes('meus historico')) {
      return 'GERAL';
    }

    return null;
  }

  private async interpretarComWorkersAI(texto: string): Promise<AnaliseIntencaoIA> {
    if (this.opcoes.usarIA === false) {
      console.log(`[${this.agentName}] IA desativada para esta requisição — respondendo por regras locais (modo econômico).`);
      return this.fallbackHeuristico(texto);
    }

    // Orçamento diário de IA por usuário (degrada para regras locais ao estourar).
    const orcamentoDisponivel = await consumirOrcamentoIA(this.env, this.opcoes.userId ?? '');
    if (!orcamentoDisponivel) {
      console.log(`[${this.agentName}] Orçamento diário de IA atingido — respondendo por regras locais.`);
      return this.fallbackHeuristico(texto);
    }

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
      const chamadaIa = this.env.AI.run(MODELO_IA, {
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

      const aiResponse: any = await this.comTempoLimite(chamadaIa);

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

  /** Aplica tempo limite à chamada da IA; ao estourar, rejeita e cai no fallback heurístico. */
  private comTempoLimite(chamada: Promise<any>): Promise<any> {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<never>((_, rejeitar) => {
      temporizador = setTimeout(
        () => rejeitar(new Error(`Timeout do Workers AI após ${TIMEOUT_IA_MS / 1000}s`)),
        TIMEOUT_IA_MS
      );
    });
    return Promise.race([chamada, limite]).finally(() => {
      if (temporizador !== undefined) clearTimeout(temporizador);
    });
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
    // Antes de tudo, tenta as regras locais de registro (cobrem os casos comuns
    // mesmo quando a IA está indisponível).
    const registroLocal = this.interpretarRegistroLocal(texto);
    if (registroLocal) return registroLocal;

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
      respostaTextual: 'Olá! Eu sou seu assistente de fitness. 💪 Posso registrar treinos, passos, hidratação e alimentação, além de mostrar seus registros. O que gostaria de fazer?'
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

  private async consultarAlimentacao(userId: string, apenasHoje: boolean = false): Promise<string> {
    const alimentos = await this.repository.buscarAlimentos(userId, 10, apenasHoje);

    if (alimentos.length === 0) {
      return apenasHoje
        ? 'Você ainda não registrou alimentação hoje.'
        : 'Ainda não encontrei registros de alimentação para você. Registre um consumo para acompanhar.';
    }

    const filtro = apenasHoje ? ' de hoje' : ' mais recentes';
    const linhas = alimentos.map((registro, indice) => {
      const data = new Date(registro.data).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
      const unidade = registro.unidade ? ` ${registro.unidade}` : '';
      return `${indice + 1}. ${registro.alimento} - ${registro.quantidade}${unidade} - ~${registro.calorias} kcal (${data})`;
    });
    const totalCalorias = alimentos.reduce((total, registro) => total + registro.calorias, 0);

    return `🍽️ Seus ${alimentos.length} registros de alimentação${filtro}:\n` +
      `${linhas.join('\n')}\n\n` +
      `Total estimado: ~${totalCalorias} kcal.`;
  }

  private async consultarTreinos(userId: string, apenasHoje: boolean = false): Promise<string> {
    const treinos = await this.repository.buscarTreinos(userId, 10, apenasHoje);

    if (treinos.length === 0) {
      return apenasHoje
        ? 'Você ainda não registrou exercícios hoje.'
        : 'Ainda não encontrei registros de exercícios para você. Registre uma atividade para acompanhar.';
    }

    const filtro = apenasHoje ? ' de hoje' : ' mais recentes';
    const linhas = treinos.map((registro, indice) => {
      const data = new Date(registro.data).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
      return `${indice + 1}. ${registro.tipo} - ${registro.duracaoMinutos} min - ~${registro.calorias} kcal (${data})`;
    });
    const totalCalorias = treinos.reduce((total, registro) => total + registro.calorias, 0);

    return `💪 Seus ${treinos.length} registros de exercícios${filtro}:\n` +
      `${linhas.join('\n')}\n\n` +
      `Total estimado: ~${totalCalorias} kcal.`;
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

    const treinosHoje = await this.repository.buscarTreinos(userId, 10, true);
    const totalKcalHoje = treinosHoje.reduce((total, registro) => total + registro.calorias, 0);

    return `💪 **Excelente Treino Registrado!**\n` +
      `• **Modalidade:** ${tipo}\n` +
      `• **Duração:** ${duracao} minutos\n` +
      `• **Gasto Estimado:** ~${calorias} kcal\n` +
      `• **Total gasto hoje:** ~${totalKcalHoje.toLocaleString('pt-BR')} kcal\n\n` +
      `A disciplina supera a motivação. Parabéns pelo esforço de hoje! 🔥`;
  }

  private async executarRegistroPassos(userId: string, quantidade: number): Promise<string> {
    const meta = 7000;
    await this.repository.salvarPassos(userId, { quantidade });
    const totalHoje = await this.repository.buscarPassosHoje(userId);
    const pct = Math.min(Math.round((totalHoje / meta) * 100), 100);
    const barra = '▓'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
    const faltam = Math.max(meta - totalHoje, 0);

    return `🖐🏽 **Passos do Dia Registrados!**\n` +
      `• **Registrado agora:** +${quantidade.toLocaleString('pt-BR')} passos\n` +
      `• **Total hoje:** ${totalHoje.toLocaleString('pt-BR')} / ${meta.toLocaleString('pt-BR')} passos\n` +
      `• **Status:** ${pct}%\n` +
      `[${barra}]\n\n` +
      (pct >= 100 ? '🎉 Meta diária batida! Excelente mobilidade!' : `Faltam ${faltam.toLocaleString('pt-BR')} passos para a meta!`);
  }

  private async executarRegistroAgua(userId: string, quantidadeMl: number): Promise<string> {
    const metaMl = 2000;
    await this.repository.salvarAgua(userId, { quantidadeMl });
    const totalHoje = await this.repository.buscarAguaHoje(userId);
    const percentual = Math.min(Math.round((totalHoje / metaMl) * 100), 100);
    const faltamMl = Math.max(metaMl - totalHoje, 0);

    return `💧 **Água Registrada!**\n` +
      `• **Registrado agora:** +${quantidadeMl.toLocaleString('pt-BR')} ml\n` +
      `• **Total hoje:** ${totalHoje.toLocaleString('pt-BR')} ml\n` +
      `• **Progresso:** ${percentual}% da meta diária de ${metaMl.toLocaleString('pt-BR')} ml\n\n` +
      (percentual >= 100 ? `🎉 Meta de hidratação atingida!` : `Faltam ${faltamMl.toLocaleString('pt-BR')} ml para a meta!`);
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

    const alimentosHoje = await this.repository.buscarAlimentos(userId, 10, true);
    const totalKcalHoje = alimentosHoje.reduce((total, registro) => total + registro.calorias, 0);

    return `🍽️ **Consumo Registrado!**\n` +
      `• **Alimento:** ${alimento}${unidade ? ` (${unidade})` : ''}\n` +
      `• **Quantidade:** ${quantidade}\n` +
      `• **Calorias estimadas:** ~${calorias} kcal\n` +
      `• **Total consumido hoje:** ~${totalKcalHoje.toLocaleString('pt-BR')} kcal\n\n` +
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