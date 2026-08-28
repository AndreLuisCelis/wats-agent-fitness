import { FitnessAgent } from './agent/fitness-agent.js';
import { Env } from './types/fitness.js';
import { calcularHashSenha, criarToken, extrairTokenAutorizacao, gerarSalt, verificarToken } from './auth.js';
import { verificarLimitesChat } from './limites.js';
import { FitnessRepository } from './repositories/fitness-repository.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/chat') {
      return processarChatWeb(request, env);
    }

    if (url.pathname === '/api/auth/registro') {
      return processarRegistro(request, env);
    }

    if (url.pathname === '/api/auth/login') {
      return processarLogin(request, env);
    }

    // 1. Validação do Webhook pelo painel da Meta/WhatsApp (GET)
    if (request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Token de verificação inválido', { status: 403 });
    }

    // 2. Recebimento de Mensagens do WhatsApp (POST)
    if (request.method === 'POST') {
      try {
        const body: any = await request.json();

        const entry = body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];

        // Processa apenas mensagens de texto
        if (message && message.type === 'text') {
          const userId = message.from;
          const textoMensagem = message.text.body;

          const agent = new FitnessAgent(env);
          const { resposta } = await agent.processarMensagem(userId, textoMensagem);

          await responderWhatsApp(env, userId, resposta);

          return new Response(JSON.stringify({
            status: 'ok',
            message: 'Mensagem processada com sucesso',
            response: resposta
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        return new Response(JSON.stringify({
          status: 'ok',
          message: 'Evento recebido, mas nenhuma mensagem de texto foi processada'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (error) {
        console.error('[Webhook Error]:', error);
        return new Response('Erro Interno no Servidor', { status: 500 });
      }
    }

    return new Response('Método não permitido', { status: 405 });
  }
};

interface RequisicaoChatWeb {
  mensagem?: unknown;
}

interface RequisicaoAuth {
  nome?: unknown;
  email?: unknown;
  senha?: unknown;
}

const VALIDADE_TOKEN_SEGUNDOS = 86_400;

function validarNome(nome: string): boolean {
  return nome.length >= 2 && nome.length <= 60;
}

function validarEmail(email: string): boolean {
  return email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarSenha(senha: string): boolean {
  return senha.length >= 6 && senha.length <= 72;
}

function mensagemDeLimite(motivo: 'MINUTO' | 'DIA'): string {
  return motivo === 'MINUTO'
    ? 'Você enviou muitas mensagens em pouco tempo. Aguarde um minuto e tente novamente. ⏳'
    : 'Você atingiu o limite diário de mensagens. Volte amanhã! 🌙';
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origensPermitidas = [
    ...(env.FRONTEND_ORIGINS?.split(',') ?? []),
    env.FRONTEND_ORIGIN ?? ''
  ].map((origem) => origem.trim()).filter(Boolean);
  const origemDaRequisicao = request.headers.get('Origin');
  const origemPermitida = origemDaRequisicao && origensPermitidas.includes(origemDaRequisicao)
    ? origemDaRequisicao
    : origemDaRequisicao
      ? undefined
      : origensPermitidas[0] || '*';

  return {
    ...(origemPermitida ? { 'Access-Control-Allow-Origin': origemPermitida } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  };
}

function respostaJson(dados: unknown, status: number, request: Request, env: Env): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request, env)
    }
  });
}

/** Endpoint independente do WhatsApp para o cliente web. */
async function processarChatWeb(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (request.method !== 'POST') {
    return respostaJson({ erro: 'Método não permitido' }, 405, request, env);
  }

  if (!env.AUTH_SECRET) {
    return respostaJson({ erro: 'Servidor sem AUTH_SECRET configurado.' }, 500, request, env);
  }

  // Autenticação obrigatória: o userId vem SEMPRE do token, nunca do corpo.
  const token = extrairTokenAutorizacao(request);
  if (!token) {
    return respostaJson({ erro: 'Autenticação necessária. Faça login para conversar.' }, 401, request, env);
  }

  const userId = await verificarToken(token, env.AUTH_SECRET);
  if (!userId) {
    return respostaJson({ erro: 'Sessão expirada ou inválida. Faça login novamente.' }, 401, request, env);
  }

  try {
    const body = await request.json<RequisicaoChatWeb>();
    const mensagem = typeof body.mensagem === 'string' ? body.mensagem.trim() : '';

    if (!mensagem || mensagem.length > 2_000) {
      return respostaJson({ erro: 'Informe uma mensagem de até 2.000 caracteres.' }, 400, request, env);
    }

    // Rate limiting por usuário (por minuto e por dia).
    const limite = await verificarLimitesChat(env, userId);
    if (!limite.permitido) {
      return respostaJson({ erro: mensagemDeLimite(limite.motivo ?? 'MINUTO') }, 429, request, env);
    }

    const agent = new FitnessAgent(env, 'FitBot Pro', { userId, usarIA: env.USAR_IA !== false });
    const { resposta, sugestoes } = await agent.processarMensagem(userId, mensagem);
    return respostaJson({ resposta, sugestoes }, 200, request, env);
  } catch (error) {
    console.error('[Chat Web Error]:', error);
    return respostaJson({ erro: 'Não foi possível processar sua mensagem.' }, 500, request, env);
  }
}

/** POST /api/auth/registro — cria usuário (nome, e-mail único e senha) e já devolve o token. */
async function processarRegistro(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (request.method !== 'POST') {
    return respostaJson({ erro: 'Método não permitido' }, 405, request, env);
  }

  if (!env.AUTH_SECRET) {
    return respostaJson({ erro: 'Servidor sem AUTH_SECRET configurado.' }, 500, request, env);
  }

  try {
    const body = await request.json<RequisicaoAuth>();
    const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const senha = typeof body.senha === 'string' ? body.senha : '';

    if (!validarNome(nome)) {
      return respostaJson({ erro: 'Informe seu nome (2 a 60 caracteres).' }, 400, request, env);
    }
    if (!validarEmail(email)) {
      return respostaJson({ erro: 'Informe um e-mail válido.' }, 400, request, env);
    }
    if (!validarSenha(senha)) {
      return respostaJson({ erro: 'A senha deve ter de 6 a 72 caracteres.' }, 400, request, env);
    }

    const repository = new FitnessRepository(env.DB);

    if (await repository.buscarUsuarioPorEmail(email)) {
      return respostaJson({ erro: 'E-mail já cadastrado. Faça login.' }, 409, request, env);
    }

    const salt = gerarSalt();
    const senhaHash = await calcularHashSenha(senha, salt);
    const usuario = {
      id: crypto.randomUUID(),
      nome,
      email,
      senhaHash,
      salt
    };

    try {
      await repository.criarUsuario(usuario);
    } catch (erroBanco) {
      // Rede de segurança caso dois registros disputem o mesmo e-mail simultaneamente.
      if (erroBanco instanceof Error && erroBanco.message.includes('UNIQUE constraint failed')) {
        return respostaJson({ erro: 'E-mail já cadastrado. Faça login.' }, 409, request, env);
      }
      throw erroBanco;
    }

    const token = await criarToken(usuario.id, env.AUTH_SECRET, VALIDADE_TOKEN_SEGUNDOS);
    return respostaJson(
      {
        token,
        usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
        expiraEm: Date.now() + VALIDADE_TOKEN_SEGUNDOS * 1000
      },
      201,
      request,
      env
    );
  } catch (error) {
    console.error('[Registro Error]:', error);
    return respostaJson({ erro: 'Não foi possível criar a conta.' }, 500, request, env);
  }
}

/** POST /api/auth/login — valida e-mail/senha e emite JWT assinado (24h). */
async function processarLogin(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (request.method !== 'POST') {
    return respostaJson({ erro: 'Método não permitido' }, 405, request, env);
  }

  if (!env.AUTH_SECRET) {
    return respostaJson({ erro: 'Servidor sem AUTH_SECRET configurado.' }, 500, request, env);
  }

  try {
    const body = await request.json<RequisicaoAuth>();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const senha = typeof body.senha === 'string' ? body.senha : '';

    if (!email || !senha) {
      return respostaJson({ erro: 'Informe e-mail e senha.' }, 400, request, env);
    }

    const repository = new FitnessRepository(env.DB);
    const usuario = await repository.buscarUsuarioPorEmail(email);
    if (!usuario) {
      return respostaJson({ erro: 'E-mail ou senha inválido.' }, 401, request, env);
    }

    const senhaHash = await calcularHashSenha(senha, usuario.salt);
    if (senhaHash !== usuario.senhaHash) {
      return respostaJson({ erro: 'E-mail ou senha inválido.' }, 401, request, env);
    }

    const token = await criarToken(usuario.id, env.AUTH_SECRET, VALIDADE_TOKEN_SEGUNDOS);
    return respostaJson(
      {
        token,
        usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
        expiraEm: Date.now() + VALIDADE_TOKEN_SEGUNDOS * 1000
      },
      200,
      request,
      env
    );
  } catch (error) {
    console.error('[Login Error]:', error);
    return respostaJson({ erro: 'Não foi possível entrar. Tente novamente.' }, 500, request, env);
  }
}

/**
 * Função utilitária para enviar respostas via Meta Graph API
 */
async function responderWhatsApp(env: Env, to: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.WHATSAPP_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: text }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[WhatsApp API Error]:', err);
    throw new Error(`Falha ao enviar mensagem para a Meta Graph API: HTTP ${response.status}`);
  }
}
