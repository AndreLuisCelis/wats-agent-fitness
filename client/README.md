# Cliente Angular — FitBot Pro

Interface de chat para o `FitnessAgent`. Ela chama `POST /api/chat` no Worker sem passar pela Meta/WhatsApp.

## Executar localmente

Em dois terminais, na raiz do repositório:

```bash
npm run dev:local
npm run client:install
npm run client:start
```

Abra `http://localhost:4200`. O cliente usa por padrão `http://127.0.0.1:8787/api/chat`.

## Publicação

Antes de gerar o build de produção, substitua `https://SEU-WORKER.workers.dev/api/chat` em `src/environments/environment.production.ts` pela URL publicada do Worker. Depois execute:

```bash
npm run client:build
```

O conteúdo gerado estará em `client/dist/fitness-agent-client/browser`. Ao hospedar o cliente em outro domínio, defina `FRONTEND_ORIGIN` no Worker com a origem do site (por exemplo, `https://fitbot.exemplo.com`) para restringir o CORS.
