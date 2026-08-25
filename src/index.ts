import { FitnessAgent } from './agent/fitness-agent.js';
import { Env } from './types/fitness.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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
  }
}