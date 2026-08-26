import { FitnessAgent } from './agent/fitness-agent.js';
import { Env } from './types/fitness.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/chat') {
      return processarChatWeb(request, env);
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
          const respostaIA = await agent.processarMensagem(userId, textoMensagem);

          await responderWhatsApp(env, userId, respostaIA);

          return new Response(JSON.stringify({
            status: 'ok',
            message: 'Mensagem processada com sucesso',
            response: respostaIA
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
  userId?: unknown;
  mensagem?: unknown;
}

function corsHeaders(env: Env): HeadersInit {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function respostaJson(dados: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(env)
    }
  });
}

/** Endpoint independente do WhatsApp para o cliente web. */
async function processarChatWeb(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  if (request.method !== 'POST') {
    return respostaJson({ erro: 'Método não permitido' }, 405, env);
  }

  try {
    const body = await request.json<RequisicaoChatWeb>();
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const mensagem = typeof body.mensagem === 'string' ? body.mensagem.trim() : '';

    if (!userId || userId.length > 100 || !mensagem || mensagem.length > 2_000) {
      return respostaJson(
        { erro: 'Informe um identificador de usuário e uma mensagem de até 2.000 caracteres.' },
        400,
        env
      );
    }

    const agent = new FitnessAgent(env);
    const resposta = await agent.processarMensagem(userId, mensagem);
    return respostaJson({ resposta }, 200, env);
  } catch (error) {
    console.error('[Chat Web Error]:', error);
    return respostaJson({ erro: 'Não foi possível processar sua mensagem.' }, 500, env);
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
