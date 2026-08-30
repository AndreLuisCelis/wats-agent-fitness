# Cliente Angular — FitBot Pro

Interface de chat para o `FitnessAgent`. Ela chama `POST /api/chat` no Worker sem passar pela Meta/WhatsApp.

## Executar localmente

Na raiz do repositório, instale as dependências do cliente:

```bash
npm run client:install
```

Em dois terminais, inicie o Worker e o frontend:

Terminal do Worker:

```bash
npm run dev:local
```

Terminal do frontend:

```bash
npm run client:start
```

Abra `http://localhost:4200`. O cliente usa por padrão `http://127.0.0.1:8787/api/chat`.

## Design system (estilo ChatGPT)

A interface segue o design system do ChatGPT (OpenAI): visual monocromático, conteúdo centralizado em 768 px e componentes discretos.

- **Tokens de tema** em `src/styles.css`: tema claro (fundo `#ffffff`, texto `#0d0d0d`) e tema escuro (fundo `#212121`, texto `#ececec`), alternados pelo atributo `[data-theme]` no `<html>`.
- **Alternância de tema** pelo botão de sol/lua (cabeçalho e tela de login); a escolha fica salva em `localStorage`, chave `fitbot-tema`. Um script inline no `index.html` aplica o tema antes do Angular carregar, evitando "flash" de cor errada.
- **Layout fullscreen**: mensagens do agente em texto puro, mensagens do usuário em bolha cinza arredondada e composer arredondado com botão circular de enviar.
- **Tela inicial** estilo ChatGPT: título centralizado com chips de sugestão clicáveis enquanto não há conversa.

## Renderização das mensagens do agente

O agente responde em texto com markdown simples (`**negrito**`) e barra de progresso em caracteres de bloco (ex.: `[▓▓▓▓▓▓░░░░]`) — formato que o WhatsApp continua recebendo como texto. O cliente converte isso na tela:

- `**texto**` vira `<strong>` real (os asteriscos não aparecem). O HTML é escapado antes da conversão e o Angular sanitiza a renderização via `[innerHTML]`.
- A linha da barra em caracteres é detectada e substituída por uma barra de progresso em CSS: pill arredondada, preenchimento verde, animação suave e atributos ARIA de `progressbar`.

## Solução de problemas

### O front não conversa com o worker local

Se o navegador só recebe tempo limite esgotado, provavelmente existe um processo `workerd` órfão de um `wrangler dev` anterior ocupando a porta 8787. Localize e encerre:

```powershell
Get-NetTCPConnection -LocalPort 8787 -State Listen | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

Reinicie o Worker com `npm run dev` e recarregue a página. Confira também se `.dev.vars` contém `FRONTEND_ORIGIN=http://localhost:4200` (origem liberada no CORS) e se `src/environments/environment.ts` aponta para `http://127.0.0.1:8787/api/chat`.

## Publicação

Antes de gerar o build de produção, substitua `https://SEU-WORKER.workers.dev/api/chat` em `src/environments/environment.production.ts` pela URL publicada do Worker. Depois execute:

```bash
npm run client:build
```

O conteúdo gerado estará em `client/dist/fitness-agent-client/browser`. Ao hospedar o cliente em outro domínio, defina `FRONTEND_ORIGIN` no Worker com a origem do site (por exemplo, `https://fitbot.exemplo.com`) para restringir o CORS.

## Verificar logs do Worker

Para acompanhar o Worker publicado em tempo real:

```bash
npx wrangler tail whatsapp-fitness-agent
```

Para exibir apenas erros:

```bash
npx wrangler tail whatsapp-fitness-agent --status error
```

Envie uma mensagem pelo cliente enquanto o comando estiver em execução e interrompa com `Ctrl+C`.
