export type TipoTreino = 'SPINNING' | 'CALISTHENICS' | 'WEIGHTLIFTING' | 'WALKING' | 'RUNNING' | 'OTHER';

export interface DadosTreino {
  tipo: TipoTreino;
  duracaoMinutos: number;
}

export interface DadosPassos {
  quantidade: number;
}

export interface DadosAgua {
  quantidadeMl: number;
}

export interface DadosAlimento {
  alimento: string;
  quantidade: number;
  unidade?: string;
}

export interface AnaliseIntencaoIA {
  intencaoIdentificada: 'REGISTRAR_TREINO' | 'REGISTRAR_PASSOS' | 'REGISTRAR_AGUA' | 'REGISTRAR_ALIMENTO' | 'CONSULTAR_REGISTROS' | 'CONVERSA_GERAL';
  dadosTreino?: DadosTreino;
  dadosPassos?: DadosPassos;
  dadosAgua?: DadosAgua;
  dadosAlimento?: DadosAlimento;
  respostaTextual: string;
  pensamentoIa?: string;
}

export interface RegistroTreino {
  id?: string;
  userId: string;
  tipo: TipoTreino;
  duracaoMinutos: number;
  calorias: number;
  data: string;
}

export interface RegistroAlimento {
  id?: string;
  userId: string;
  alimento: string;
  quantidade: number;
  unidade?: string;
  calorias: number;
  data: string;
}

export interface Env {
  AI: any;
  DB?: D1Database;
  FRONTEND_ORIGIN?: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_API_TOKEN: string;
}
