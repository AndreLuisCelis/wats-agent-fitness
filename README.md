# FitBot Pro 🏋️‍♂️💧🍌

### Seu assistente de hábitos e treinos — no navegador e no WhatsApp

O FitBot Pro transforma mensagens simples em pequenas vitórias do dia a dia.
Você escreve **“fiz 30 min de corrida”**, **“bebi 500 ml de água”** ou **“comi 2 bananas”** e ele registra tudo, estima calorias e acompanha seu progresso.

Sem planilhas intermináveis. Sem sermão. Só um empurrãozinho inteligente para cuidar melhor de você. ✨

> As calorias são estimativas e não substituem orientação profissional.

## O que ele sabe fazer

- Registrar treinos, incluindo corrida, caminhada, spinning, musculação e calistenia.
- Estimar o gasto calórico de cada exercício.
- Registrar passos e acompanhar a meta diária de 7.000 passos.
- Registrar água e mostrar o progresso rumo à meta padrão de 2.000 ml.
- Registrar alimentos com estimativa de calorias por porção.
- Consultar seus registros de hoje ou do histórico.
- Conversar sobre hábitos e fitness com ajuda do Workers AI.
- Responder consultas e registros claros com regras locais, economizando chamadas à IA.
- Criar conta, fazer login e manter a sessão do cliente web protegida por JWT.
- Aplicar limites de uso por minuto e por dia.
- Interface web com design minimalista inspirado no ChatGPT, incluindo tema claro e escuro.

## Uma conversa típica

```text
Você:  Fiz 45 minutos de spinning
FitBot: Treino registrado! Aproximadamente 473 kcal. 🔥

Você:  Bebi 600 ml de água
FitBot: Hidratação atualizada: 600 ml de 2.000 ml. 💧

Você:  O que comi hoje?
FitBot: Consulta seus registros de alimentação e mostra o total estimado. 🍽️
```

As mensagens podem chegar pelo cliente web ou pelo webhook oficial do WhatsApp:

```text
Cliente web / WhatsApp
          ↓
Cloudflare Worker
          ↓
Regras locais → Workers AI, quando necessário
          ↓
Cloudflare D1
          ↓
Resposta simpática do FitBot
```

## O projeto por dentro

| Parte | Papel |
| --- | --- |
| `src/index.ts` | Entrada do Worker, API web e webhook do WhatsApp |
| `src/agent/fitness-agent.ts` | Cérebro conversacional e regras de negócio |
| `src/repositories/fitness-repository.ts` | Leitura e gravação no Cloudflare D1 |
| `src/auth.ts` | Hash de senhas e tokens JWT |
| `src/limites.ts` | Rate limiting e orçamento diário da IA |
| `src/types/fitness.ts` | Contratos TypeScript do domínio fitness |
| `migrations/` | Estrutura versionada das tabelas do banco |
| `client/` | Interface Angular do chat, com design estilo ChatGPT e tema claro/escuro |

### Stack

- **Backend:** TypeScript + Cloudflare Workers
- **IA:** Cloudflare Workers AI (`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`)
- **Banco:** Cloudflare D1 (SQLite)
- **Frontend:** Angular 22
- **Runtime:** Node.js 22.22.3 ou superior
- **Integração externa:** WhatsApp Business Platform via Meta Graph API

## Começando a brincadeira

### Pré-requisitos

- Node.js `22.22.3` ou superior
- npm
- Wrangler instalado como dependência do projeto

Instale as dependências do Worker:

```bash
npm install
```

Se precisar preparar o banco local:

```bash
npm run db:migrate:local
```

### Rodando o Worker

```bash
npm run dev:local
```

O backend ficará disponível em `http://127.0.0.1:8787`.

### Rodando o cliente Angular

Em outro terminal:

```bash
npm run client:install
npm run client:start
```

Abra [http://localhost:4200](http://localhost:4200), crie sua conta e comece a conversar.

A interface segue um design minimalista inspirado no ChatGPT: tema claro e escuro (botão no cabeçalho; a preferência fica salva no navegador), mensagens do agente com negrito renderizado e barra de progresso gráfica para a meta de passos.

Para gerar o build do cliente:

```bash
npm run client:build
```

O resultado será criado em `client/dist/fitness-agent-client/browser`.

## Configuração local

Crie um arquivo `.dev.vars` na raiz — ele é local e **não deve ser commitado**:

```env
WHATSAPP_VERIFY_TOKEN=um-token-local
AUTH_SECRET=um-segredo-forte-para-desenvolvimento
FRONTEND_ORIGIN=http://localhost:4200

# Limites opcionais
LIMITE_MSGS_MINUTO=12
LIMITE_MSGS_DIA=300
LIMITE_IA_DIA=300
```

O binding do D1 e o binding do Workers AI já estão descritos em `wrangler.jsonc`.

Para usar o WhatsApp real, ainda são necessárias uma conta Meta Business, um aplicativo com WhatsApp Business Platform, um número configurado e os segredos válidos da Meta. Não use valores fictícios em produção.

## APIs principais

O cliente web usa autenticação antes de acessar o chat:

```text
POST /api/auth/registro
POST /api/auth/login
POST /api/chat       (Authorization: Bearer <token>)
```

O webhook do WhatsApp usa:

```text
GET  /webhook        validação do webhook da Meta
POST /webhook        recebimento de mensagens
```

Exemplo de registro pelo endpoint web:

```json
{
  "mensagem": "fiz 30 min de corrida"
}
```

O `userId` não precisa ser enviado: ele é obtido a partir do token autenticado.

## Testando sem WhatsApp

O desenvolvimento local não depende de uma conta Meta. Com o Worker em execução, você pode testar o webhook com Postman ou `curl`.

```bash
curl -X POST http://127.0.0.1:8787/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "5511999998888",
            "type": "text",
            "text": { "body": "bebi 600 ml de água" }
          }]
        }
      }]
    }]
  }'
```

Para conferir a validação do webhook:

```text
GET /webhook?hub.mode=subscribe&hub.verify_token=um-token-local&hub.challenge=abc123
```

Mais exemplos de Postman, respostas esperadas e diagnóstico estão em [DOCUMENTACAO.md](DOCUMENTACAO.md).

## Solução de problemas

### O front local não conversa com o worker local

Se o navegador só recebe tempo limite esgotado, pode existir um processo `workerd` órfão de um `wrangler dev` anterior ocupando a porta 8787 — ela aceita conexões, mas o worker não responde. Localize e encerre o processo:

```powershell
Get-NetTCPConnection -LocalPort 8787 -State Listen | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

Depois, inicie o Worker novamente com `npm run dev` e recarregue a página. Confirme também que o `.dev.vars` mantém `FRONTEND_ORIGIN=http://localhost:4200`, origem liberada no CORS do Worker.

## Banco e migrações

As migrações criam as estruturas para:

- treinos;
- métricas diárias de passos e água;
- alimentos;
- usuários autenticados;
- contadores de limites e orçamento de IA.

Aplicar no ambiente local:

```bash
npm run db:migrate:local
```

Aplicar no banco remoto:

```bash
npm run db:migrate:remote
```

## Publicação

Depois de configurar a conta Cloudflare e os segredos de produção:

```bash
npx wrangler deploy
```

Para observar o Worker publicado:

```bash
npx wrangler tail whatsapp-fitness-agent
```

Antes de publicar o frontend, confira a URL do Worker em `client/src/environments/environment.production.ts` e gere o build com `npm run client:build`.

## Estado atual

O núcleo do FitBot está funcionando: Worker, cliente web com design estilo ChatGPT (tema claro/escuro), autenticação, registros, consultas locais, Workers AI, D1 e integração preparada com a Meta.

As próximas evoluções mais importantes são:

- validar a assinatura `X-Hub-Signature` dos webhooks;
- tratar outros tipos de mensagem além de texto;
- validar com mais rigor as respostas JSON da IA;
- melhorar validações de duração, quantidade e valores;
- adicionar testes automatizados;
- concluir a configuração e a validação da integração real com o WhatsApp.

## Documentação completa

Este README é o mapa rápido para quem quer executar o projeto. Para entender as decisões, o fluxo detalhado, os testes manuais e o dicionário de tecnologias, consulte [DOCUMENTACAO.md](DOCUMENTACAO.md).

Agora é só abrir o chat, mandar uma mensagem e dar o primeiro passo — literalmente ou não. 🚀
