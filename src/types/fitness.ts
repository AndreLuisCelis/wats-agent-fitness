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

export interface AnaliseIntencaoIA {
  intencaoIdentificada: 'REGISTRAR_TREINO' | 'REGISTRAR_PASSOS' | 'REGISTRAR_AGUA' | 'CONVERSA_GERAL';
  dadosTreino?: DadosTreino;
  dadosPassos?: DadosPassos;
  dadosAgua?: DadosAgua;
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

export interface Env {
  AI: any;
  DB?: D1Database;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_API_TOKEN: string;
}