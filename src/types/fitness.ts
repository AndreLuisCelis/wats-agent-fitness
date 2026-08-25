// Define as modalidades esportivas suportadas pelo agente
export type TipoTreino = 'CALISTHENICS' | 'SPINNING' | 'WEIGHTLIFTING' | 'WALKING' | 'RUNNING' |
'OTHER';
// Interface do registro individual de treino
export interface RegistroTreino {
 id: string;
 userId: string;
 tipo: TipoTreino;
 duracaoMinutos: number;
 caloriasEstimadas: number;
 data: string;
}
// Interface das métricas de saúde diária
export interface MetricasDiarias {
 userId: string;
 data: string;
 passos: number;
 metaPassos: number;
 aguaMl: number;
 metaAguaMl: number;
}
// Estrutura do resultado extraído pela IA
export interface AnaliseIntencaoIA {
 intencaoIdentificada: 'REGISTRAR_TREINO' | 'REGISTRAR_PASSOS' | 'REGISTRAR_AGUA' |
'CONSULTAR_PROGRESSO' | 'CONVERSA_GERAL';
 dadosTreino?: {
 tipo: TipoTreino;
 duracaoMinutos: number;
 };
 dadosPassos?: {
 quantidade: number;
 };
 dadosAgua?: {
 quantidadeMl: number;
 };
 pensamentoIa?: string; // Conteúdo extraído da tag <think>
 respostaTextual: string;
}
// Interface para as variáveis de ambiente e bindings do Cloudflare Worker
export interface Env {
 AI: any; // Binding do Workers AI
 WA_VERIFY_TOKEN: string;
 WA_APP_SECRET: string;
 WA_API_ACCESS_TOKEN: string;
 WA_PHONE_NUMBER_ID: string;
}
