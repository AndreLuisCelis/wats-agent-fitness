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
