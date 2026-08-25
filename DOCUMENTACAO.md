# WhatsApp Fitness Agent

> Um guia de bordo para construir, passo a passo, um agente de fitness conectado ao WhatsApp.

## 1. Sobre este documento

Este arquivo funciona como um pequeno livro didático sobre o projeto. Ele explica, com calma e sem pressupor experiência, tudo o que existe até o momento. A ideia é que uma pessoa iniciante consiga entender:

- qual é o objetivo técnico da estrutura atual;
- para que serve cada arquivo;
- quais ferramentas foram preparadas;
- o que já está funcionando;
- o que ainda precisa ser desenvolvido.

A documentação descreve o estado real do projeto. Neste momento, a base foi configurada, mas a lógica do agente ainda não foi escrita.

## Como ler este guia

Pense no projeto como uma casa que acabou de receber sua planta e suas ferramentas. O terreno está preparado, os cômodos foram separados, mas ainda falta construir as paredes e instalar os móveis.

Por isso, este documento usa três ideias simples:

- **o que é**: a explicação da tecnologia;
- **para que serve**: o motivo de ela existir neste projeto;
- **o que acontece agora**: o estado concreto da implementação.

Não é necessário memorizar tudo de uma vez. Comece pelo mapa abaixo e volte aos capítulos conforme cada parte for sendo implementada.

### Mapa da jornada

1. Entender o objetivo do agente.
2. Conhecer a estrutura de pastas.
3. Aprender o papel do Node.js e do npm.
4. Entender TypeScript e a checagem de tipos.
5. Entender Cloudflare Workers e Wrangler.
6. Acompanhar o que já foi preparado.
7. Usar Git para registrar a evolução.
8. Implementar, testar e publicar com segurança.

> **Nota importante:** configuração não é implementação. Ter um binding de IA configurado, por exemplo, prepara uma porta; ainda será necessário escrever o código que passa por ela.

## Capítulo 1 — Objetivo do projeto

O projeto se chama `whatsapp-fitness-agent`. Pelo nome e pela estrutura preparada, ele será um agente relacionado a fitness que poderá atender usuários por meio do WhatsApp.

A aplicação foi preparada para rodar como um **Cloudflare Worker**. Um Worker é uma função executada na infraestrutura da Cloudflare, sem a necessidade de manter um servidor tradicional ligado.

A arquitetura esperada, quando a implementação começar, será parecida com esta:

```text
Mensagem do usuário no WhatsApp
            |
            v
      Cloudflare Worker
            |
            +--> Processamento da mensagem
            |
            +--> Regras do agente fitness
            |
            +--> Cloudflare AI, se necessário
            |
            v
Resposta enviada ao usuário
```

Essa arquitetura ainda é uma preparação: os componentes de recebimento, processamento e resposta ainda não existem no código.

### Uma conversa em termos de software

Quando uma mensagem chega, o sistema precisará responder a algumas perguntas em ordem:

1. A mensagem veio de uma fonte confiável?
2. Qual é o texto e quem enviou?
3. O usuário está pedindo um treino, uma sugestão ou outra coisa?
4. A resposta precisa usar inteligência artificial?
5. Como devolver uma resposta clara e segura ao WhatsApp?

Essa lista é o embrião do fluxo da aplicação. Ela também mostra por que o projeto foi separado em entrada, agente e tipos: cada parte terá uma responsabilidade compreensível.

## Capítulo 2 — Estrutura atual

```text
whatsapp-fitness-agent/
├── package.json
├── package-lock.json
├── tsconfig.json
├── wrangler.jsonc
├── DOCUMENTACAO.md
└── src/
    ├── index.ts
    ├── agent/
    └── types/
    └── fitness.ts
```

### `src/index.ts`

Este é o arquivo de entrada do Worker. O Wrangler está configurado para procurar a aplicação nesse caminho.

Atualmente, o arquivo está vazio. Portanto, ainda não existe um `fetch` handler, que seria o código responsável por receber requisições HTTP.

Um Worker normalmente precisa exportar algo semelhante a um objeto com um método `fetch`, mas isso ainda será implementado em uma etapa futura.

### `src/agent/`

Esta pasta foi criada para concentrar a lógica do agente fitness.

Possíveis responsabilidades futuras:

- interpretar mensagens recebidas;
- identificar a intenção do usuário;
- montar orientações de treino ou hábitos;
- conversar com um modelo de inteligência artificial;
- aplicar regras de segurança e limites da aplicação.

A pasta está vazia no momento.

### `src/types/`

Esta pasta foi criada para guardar tipos TypeScript compartilhados.

Ela agora contém o arquivo `fitness.ts`, que descreve os formatos de dados usados pelo futuro agente. Esses tipos funcionam como etiquetas e formulários: deixam explícito quais informações existem e ajudam o TypeScript a avisar quando algo estiver no formato errado.

### `src/types/fitness.ts`

O arquivo reúne os contratos centrais do domínio fitness.

#### `TipoTreino`

```ts
export type TipoTreino =
  | 'CALISTHENICS'
  | 'SPINNING'
  | 'WEIGHTLIFTING'
  | 'WALKING'
  | 'RUNNING'
  | 'OTHER';
```

Este é um **tipo união**. Em vez de aceitar qualquer texto, ele limita a modalidade a uma lista conhecida. Assim, `RUNNING` é válido, mas `CORRIDA_DE_CARRO` não é aceito por engano.

#### `RegistroTreino`

Representa um treino individual registrado pelo usuário. Ele guarda:

- `id`: identificador do registro;
- `userId`: identificador do usuário;
- `tipo`: modalidade do treino;
- `duracaoMinutos`: duração em minutos;
- `caloriasEstimadas`: estimativa de calorias;
- `data`: data do registro.

Exemplo conceitual:

```ts
const treino: RegistroTreino = {
  id: 'treino-001',
  userId: 'usuario-001',
  tipo: 'RUNNING',
  duracaoMinutos: 30,
  caloriasEstimadas: 280,
  data: '2026-08-25'
};
```

#### `MetricasDiarias`

Representa o acompanhamento diário de hábitos. Os campos `passos` e `aguaMl` mostram o realizado; `metaPassos` e `metaAguaMl` mostram o objetivo do dia.

Essa separação é importante porque permite responder perguntas como: “quantos passos faltam para minha meta?” ou “quanto de água já bebi?”.

#### `AnaliseIntencaoIA`

Representa o resultado esperado depois que a inteligência artificial interpretar uma mensagem.

O campo `intencaoIdentificada` também usa uma lista limitada de opções:

- `REGISTRAR_TREINO`;
- `REGISTRAR_PASSOS`;
- `REGISTRAR_AGUA`;
- `CONSULTAR_PROGRESSO`;
- `CONVERSA_GERAL`.

Os campos `dadosTreino`, `dadosPassos` e `dadosAgua` são opcionais porque cada intenção precisa de informações diferentes. Uma mensagem sobre água não precisa carregar dados de treino.

O campo `respostaTextual` guarda a resposta que poderá ser enviada ao usuário. `pensamentoIa` registra o conteúdo extraído da tag `<think>` e deverá ser avaliado com cuidado antes de ser exposto ou armazenado.

#### `Env`

Descreve as configurações disponíveis no ambiente do Cloudflare Worker:

- `AI`: binding do Workers AI;
- `WA_VERIFY_TOKEN`: token usado na verificação do webhook;
- `WA_APP_SECRET`: segredo da aplicação;
- `WA_API_ACCESS_TOKEN`: token de acesso à API do WhatsApp;
- `WA_PHONE_NUMBER_ID`: identificador do número usado pela API.

Esses nomes documentam o contrato entre o código e a infraestrutura. Os valores reais não devem ser escritos no código nem commitados no Git; devem ser configurados como segredos ou variáveis de ambiente.

Possíveis tipos futuros:

- formato da mensagem recebida do WhatsApp;
- formato da resposta enviada;
- estado de uma conversa;
- configuração do agente;

Os tipos de entrada e saída do WhatsApp ainda precisam ser definidos.

## Capítulo 3 — O ecossistema Node.js e npm

O `package.json` é o arquivo principal de configuração de um projeto Node.js. Ele identifica o projeto, lista dependências e define comandos que podem ser executados pelo npm.

### Identificação

```json
"name": "whatsapp-fitness-agent"
"version": "1.0.0"
```

- `name`: nome do projeto.
- `version`: versão inicial definida para o projeto.

Os campos `main`, `keywords`, `author`, `license` e `description` ainda estão com valores genéricos ou vazios. Eles podem ser ajustados quando o projeto tiver uma descrição e uma distribuição mais definidas.

### Script atual

```json
"scripts": {
  "test": "echo \"Error: no test specified\" && exit 1"
}
```

Existe um comando chamado `npm test`, mas ele é apenas um placeholder. Quando executado, ele informa que não há testes configurados e termina com erro.

Isso não representa uma falha na lógica do agente; significa somente que a suíte de testes ainda não foi criada.

### Dependências de desenvolvimento

```json
"devDependencies": {
  "@cloudflare/workers-types": "^5.20260825.1",
  "typescript": "^7.0.2",
  "wrangler": "^4.125.0"
}
```

- `@cloudflare/workers-types`: fornece ao TypeScript os tipos usados por Cloudflare Workers, como `Request`, `Response` e objetos de ambiente.
- `typescript`: permite escrever o projeto em TypeScript e verificar tipos antes da execução.
- `wrangler`: ferramenta oficial da Cloudflare para desenvolver, testar e publicar Workers.

Essas dependências são de desenvolvimento porque são usadas para construir, validar e publicar o projeto.

### Dependência de execução

```json
"dependencies": {
  "dotenv": "^17.4.2"
}
```

`dotenv` permite carregar variáveis de ambiente a partir de um arquivo `.env` em aplicações Node.js.

Importante: embora a dependência esteja declarada, ela ainda não é utilizada por nenhum arquivo do projeto. Além disso, no ambiente Cloudflare Workers, os segredos normalmente são configurados pelo Wrangler ou pelo painel da Cloudflare, e não necessariamente por `dotenv`.

## Capítulo 4 — Repetibilidade com `package-lock.json`

O `package-lock.json` é gerado pelo npm. Ele registra versões exatas das dependências instaladas e suas dependências internas.

A diferença principal é:

- `package.json` declara o que o projeto precisa;
- `package-lock.json` registra exatamente o que foi instalado.

Isso ajuda a fazer com que diferentes computadores instalem versões consistentes.

## Capítulo 5 — TypeScript: escrever com uma rede de segurança

Este arquivo configura o compilador TypeScript.

### Opções principais

```json
"target": "ES2022"
```

Indica que o código deve usar recursos compatíveis com o padrão JavaScript ES2022.

```json
"module": "ESNext"
```

Define o uso de módulos JavaScript modernos, com `import` e `export`.

```json
"moduleResolution": "Bundler"
```

Diz ao TypeScript para resolver imports de uma forma compatível com ferramentas modernas de empacotamento, como as usadas pelo Wrangler.

```json
"lib": ["ES2022"]
```

Informa quais APIs padrão do JavaScript devem ser consideradas durante a verificação de tipos.

```json
"types": ["@cloudflare/workers-types"]
```

Adiciona ao projeto os tipos específicos da plataforma Cloudflare Workers.

```json
"strict": true
```

Ativa verificações rigorosas do TypeScript. Isso ajuda a encontrar problemas, como variáveis que podem ser `undefined`, antes de publicar a aplicação.

```json
"skipLibCheck": true
```

Evita verificar profundamente os arquivos de declaração das bibliotecas instaladas. Isso torna a verificação mais rápida e reduz ruído vindo de dependências externas.

```json
"esModuleInterop": true
```

Melhora a compatibilidade entre módulos CommonJS e módulos ES modernos.

```json
"noEmit": true
```

Faz o TypeScript apenas verificar o código, sem gerar arquivos JavaScript. O Wrangler será responsável pelo empacotamento do Worker.

### Arquivos incluídos

```json
"include": ["src/**/*"]
```

A verificação do TypeScript considera todos os arquivos dentro de `src` e suas subpastas.

## Capítulo 6 — Cloudflare Workers e Wrangler

O Wrangler usa este arquivo para saber como executar e publicar o Worker.

O formato é JSONC, ou seja, JSON com suporte a comentários. O campo abaixo aponta para o esquema de configuração usado pelo editor:

```json
"$schema": "node_modules/wrangler/config-schema.json"
```

Com esse esquema, o VS Code pode oferecer autocompletar e avisos para as opções do Wrangler.

### Nome e entrada

```json
"name": "whatsapp-fitness-agent"
"main": "src/index.ts"
```

- `name`: nome do Worker na Cloudflare.
- `main`: arquivo de entrada da aplicação.

Como `src/index.ts` está vazio, o Worker ainda não possui comportamento implementado.

### Data de compatibilidade

```json
"compatibility_date": "2026-08-25"
```

A Cloudflare usa essa data para definir quais comportamentos e APIs compatíveis devem ser aplicados ao Worker. Ela funciona como uma referência de compatibilidade do runtime.

### Binding de inteligência artificial

```json
"ai": {
  "binding": "AI"
}
```

Esse trecho reserva um binding chamado `AI`. Bindings são referências nomeadas para recursos externos que o Worker pode usar.

Na prática, o código futuro poderá receber esse recurso pelo objeto de ambiente e utilizá-lo para chamadas de IA. A configuração do binding já existe, mas nenhuma chamada à IA foi programada ainda.

### Observabilidade

```json
"observability": {
  "enabled": true
}
```

Ativa recursos de observabilidade do Worker, que podem ajudar a acompanhar logs, métricas e problemas durante a execução.

## Capítulo 7 — O que já foi preparado

Até agora, foram concluídas estas etapas:

1. O projeto foi inicializado com o nome `whatsapp-fitness-agent`.
2. A estrutura inicial de `src` foi criada.
3. O arquivo de entrada `src/index.ts` foi definido.
4. As pastas `src/agent` e `src/types` foram preparadas para organizar o código futuro.
5. TypeScript foi adicionado ao projeto.
6. Wrangler foi adicionado para desenvolvimento e publicação na Cloudflare.
7. Os tipos oficiais de Cloudflare Workers foram adicionados.
8. A configuração do TypeScript foi criada com modo estrito.
9. A configuração do Wrangler foi criada com o Worker apontando para `src/index.ts`.
10. O binding de IA chamado `AI` foi reservado.
11. A observabilidade do Worker foi habilitada.
12. O lockfile do npm foi gerado, registrando as dependências instaladas.
13. O repositório Git foi inicializado com `git init`.
14. O arquivo `src/types/fitness.ts` foi adicionado com os contratos de dados do domínio fitness.

## Capítulo 8 — O que ainda não foi feito

Os seguintes itens ainda estão pendentes:

- implementação do handler HTTP em `src/index.ts`;
- integração com a API do WhatsApp;
- validação de autenticação e assinatura dos webhooks;
- definição dos tipos das mensagens recebidas e enviadas pelo WhatsApp;
- implementação da lógica do agente fitness;
- integração efetiva com o binding `AI`;
- configuração de variáveis de ambiente e segredos;
- armazenamento do histórico das conversas;
- tratamento de erros;
- testes automatizados;
- definição de um script de teste real;
- publicação do Worker na Cloudflare.

## Capítulo 9 — Git: o diário de bordo do projeto

Git é um sistema de controle de versão. Ele registra fotografias organizadas do projeto ao longo do tempo, chamadas **commits**. Assim, é possível saber o que mudou, quando mudou e por quê.

### O que aconteceu agora

O comando abaixo foi executado:

```bash
git init
```

Esse comando criou um repositório Git local na pasta do projeto. Ele preparou o diário, mas ainda não escreveu a primeira entrada: o repositório está sem commits.

No estado atual, os arquivos aparecem como não rastreados (`??`). Isso significa que o Git ainda está vendo os arquivos pela primeira vez e aguarda uma decisão sobre quais devem entrar no histórico.

O diretório `node_modules/` também aparece nessa situação. Em projetos Node.js, ele normalmente não deve ser versionado, pois pode ser recriado com `npm install`. Antes do primeiro commit, a prática recomendada é criar um `.gitignore` para ignorá-lo, além de arquivos locais como `.env`.

### O ciclo básico do Git

```text
arquivo alterado
  |
  v
git add  -> prepara a mudança
  |
  v
git commit -> registra a mudança
  |
  v
git log -> consulta a história
```

Comandos que serão úteis na próxima etapa:

```bash
git status
git add .
git commit -m "chore: cria a estrutura inicial do projeto"
git log --oneline
```

Cada commit deve representar uma etapa que faça sentido. Mensagens claras transformam o histórico em uma história legível, e não em uma gaveta cheia de rascunhos sem nome.

## Capítulo 10 — Comandos úteis

Instalar as dependências:

```bash
npm install
```

Verificar o TypeScript sem gerar arquivos:

```bash
npx tsc --noEmit
```

Iniciar o Worker localmente com o Wrangler, quando houver uma implementação:

```bash
npx wrangler dev
```

Publicar o Worker na Cloudflare, depois que a conta e as credenciais estiverem configuradas:

```bash
npx wrangler deploy
```

Executar os testes:

```bash
npm test
```

No estado atual, `npm test` ainda falha propositalmente porque nenhum teste foi configurado.

## Capítulo 11 — Próxima etapa recomendada

A próxima etapa mais importante é implementar um handler mínimo em `src/index.ts` que responda a uma requisição HTTP. Depois disso, o projeto poderá ser executado localmente com `npx wrangler dev` e testado antes de receber a integração real com WhatsApp e IA.

Uma sequência segura de desenvolvimento seria:

1. criar uma resposta HTTP simples;
2. validar o Worker localmente;
3. criar os tipos das mensagens;
4. adicionar a lógica do agente;
5. integrar o provedor do WhatsApp;
6. integrar o binding `AI`;
7. adicionar testes;
8. configurar segredos e publicar.

## Capítulo 12 — Pequeno dicionário de tecnologia

### API

Uma API é uma forma combinada de um sistema conversar com outro. Neste projeto, o Worker poderá conversar com o WhatsApp e, quando necessário, com um serviço de inteligência artificial.

### Backend

É a parte do sistema que roda por trás da tela do usuário. O Worker será o backend responsável por receber mensagens, tomar decisões e produzir respostas.

### Deploy

É o ato de publicar uma aplicação em um ambiente onde ela poderá ser acessada. `npx wrangler deploy` será o comando de publicação quando a aplicação estiver pronta.

### Endpoint

É um endereço que recebe ou fornece dados. Um webhook do WhatsApp deverá apontar para um endpoint do Worker.

### Runtime

É o ambiente que executa o código. Neste projeto, o runtime principal será o ambiente de Cloudflare Workers, e não um servidor Node.js tradicional.

### Webhook

É uma notificação automática enviada por um sistema para outro quando algo acontece. O WhatsApp poderá enviar um webhook quando o usuário mandar uma mensagem.

## Capítulo 13 — Critério de pronto

Uma etapa do projeto pode ser considerada pronta quando existe código, existe uma forma de testá-lo e o resultado é compreensível. Para este projeto, a primeira pequena vitória será:

```text
uma requisição HTTP chega ao Worker
              |
              v
o Worker responde com sucesso
              |
              v
o comportamento é validado localmente
```

Depois disso, cada nova capacidade deve ser acrescentada em passos pequenos: tipos, validação, integração, tratamento de erros e testes. Essa ordem reduz o mistério e torna cada problema mais fácil de localizar.
