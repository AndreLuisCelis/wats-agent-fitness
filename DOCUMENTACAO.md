# WhatsApp Fitness Agent

> Um guia de bordo para construir, passo a passo, um agente de fitness conectado ao WhatsApp.

## 1. Sobre este documento

Este arquivo funciona como um pequeno livro didático sobre o projeto. Ele explica, com calma e sem pressupor experiência, tudo o que existe até o momento. A ideia é que uma pessoa iniciante consiga entender:

- qual é o objetivo técnico da estrutura atual;
- para que serve cada arquivo;
- quais ferramentas foram preparadas;
- o que já está funcionando;
- o que ainda precisa ser desenvolvido.

A documentação descreve o estado real do projeto. A base foi configurada, o agente já possui lógica própria, o Worker recebe eventos do WhatsApp, tenta enviar respostas pela Meta Graph API e persiste os dados no Cloudflare D1. Algumas validações de produção ainda estão pendentes.

> **Situação atual:** o desenvolvimento do Worker pode continuar sem uma conta Meta Business. Porém, a integração real com o WhatsApp depende da criação de uma conta Meta Business, de um aplicativo na plataforma da Meta e da configuração do WhatsApp Business Platform.

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
6. Acompanhar as implementações já realizadas.
7. Testar o webhook localmente.
8. Usar Git para registrar a evolução.
9. Publicar com segurança.

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

O recebimento, o processamento e o envio da resposta já existem no código. O Worker chama a Meta Graph API, embora a configuração das credenciais e os testes de integração com a conta real ainda precisem ser concluídos.

### Uma conversa em termos de software

Quando uma mensagem chega, o sistema precisará responder a algumas perguntas em ordem:

1. A mensagem veio de uma fonte confiável?
2. Qual é o texto e quem enviou?
3. O usuário está pedindo um treino, uma sugestão ou outra coisa?
4. A resposta precisa usar inteligência artificial?
5. Como devolver uma resposta clara e segura ao WhatsApp?

Essa lista é o embrião do fluxo da aplicação. Ela também mostra por que o projeto foi separado em entrada, agente e tipos: cada parte terá uma responsabilidade compreensível.

### O que é necessário para usar o WhatsApp em produção

Para conectar este Worker ao serviço oficial, será necessário:

1. criar ou acessar uma conta pessoal da Meta;
2. criar um portfólio empresarial no Meta Business;
3. criar um aplicativo no Meta for Developers;
4. adicionar o produto WhatsApp ao aplicativo;
5. configurar um número de telefone para a WhatsApp Business Platform;
6. obter o ID do número, o token de acesso e o segredo da aplicação;
7. configurar o webhook público apontando para o Worker.

Não é obrigatório começar instalando o aplicativo móvel WhatsApp Business. A integração deste projeto usa a API oficial da Meta, que é uma configuração separada. Ainda assim, será necessário ter uma conta empresarial e um número habilitado para a plataforma.

Enquanto esses pré-requisitos não existirem, não execute `wrangler secret put` com valores fictícios. O projeto pode ser desenvolvido e testado localmente sem enviar chamadas reais ao WhatsApp.

## Capítulo 2 — Estrutura atual

```text
whatsapp-fitness-agent/
├── package.json
├── package-lock.json
├── tsconfig.json
├── wrangler.jsonc
├── DOCUMENTACAO.md
├── migrations/
│   └── 0001_create_fitness_tables.sql
└── src/
    ├── index.ts
    ├── agent/
    │   └── fitness-agent.ts
  ├── repositories/
  │   └── fitness-repository.ts
    └── types/
        └── fitness.ts
```

### `src/index.ts`

Este é o arquivo de entrada do Worker. O Wrangler está configurado para procurar a aplicação nesse caminho.

O arquivo agora exporta o `fetch` handler, função que recebe requisições HTTP e decide como tratá-las. Ele possui estes comportamentos principais:

- requisições `GET`: validam o webhook da Meta usando `hub.mode`, `hub.verify_token` e `hub.challenge`;
- `POST /webhook`: recebe um evento, procura a primeira mensagem de texto e chama o `FitnessAgent`;
- outros métodos: respondem com status `405`.

Quando a validação GET é bem-sucedida, o Worker devolve o `hub.challenge` com status `200`. Quando o token não confere, devolve status `403`.

No POST, o código lê o JSON recebido, acessa o caminho esperado `entry[0].changes[0].value.messages[0]`, extrai o número do remetente e o texto, processa a mensagem e chama `responderWhatsApp` para devolver a resposta pela Meta Graph API. Depois, retorna um JSON com `status`, `message` e `response`, permitindo visualizar a confirmação diretamente no `curl`.

Erros inesperados no processamento são registrados e retornam status `500`. Eventos sem mensagem de texto continuam recebendo `EVENT_RECEIVED` com status `200`, mas ainda não são processados pelo agente.

Um Worker precisa exportar um objeto com um método `fetch`; esse contrato agora está implementado no arquivo de entrada.

### `src/agent/`

Esta pasta foi criada para concentrar a lógica do agente fitness.

Agora existe o arquivo `fitness-agent.ts`, que contém a classe `FitnessAgent` e a primeira versão do comportamento do assistente.

Responsabilidades implementadas:

- interpretar mensagens recebidas;
- identificar a intenção do usuário;
- registrar um treino calculando calorias estimadas;
- registrar passos e mostrar o progresso da meta diária;
- registrar água e mostrar o progresso da hidratação;
- responder conversas gerais;
- usar uma regra de contingência quando a IA não estiver disponível.

Ainda faltam validações e tratamento de todos os tipos de eventos do WhatsApp.

### `src/repositories/fitness-repository.ts`

Este arquivo faz a ponte entre a regra de negócio e o banco D1. O agente não precisa conhecer detalhes de SQL: ele apenas pede ao `FitnessRepository` para salvar um treino, passos ou água.

O repositório funciona com três operações:

- `salvarTreino`: grava usuário, modalidade, duração, calorias e data;
- `salvarPassos`: soma os passos ao registro do usuário no dia atual;
- `salvarAgua`: soma a água, em mililitros, ao registro do usuário no dia atual.

O banco é opcional no código (`DB?`). Assim, os testes locais continuam conseguindo executar a conversa mesmo antes de um binding D1 ser configurado. Quando o binding existe, os dados são persistidos.

### `migrations/0001_create_fitness_tables.sql`

Uma migração é uma receita versionada para criar ou alterar o banco. Esta primeira migração cria:

- `registros_treino`, para cada treino individual;
- `metricas_diarias`, para consolidar passos e água por usuário e data.

Também foram adicionados índices e restrições SQL. Por exemplo, duração e calorias não podem assumir valores inválidos, e a combinação de usuário com data identifica uma única métrica diária.

O banco D1 `whatsapp-fitness-agent-db` foi criado na Cloudflare e a migração `0001_create_fitness_tables.sql` foi aplicada nos ambientes local e remoto.

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

O campo `dadosAgua` contém `quantidadeMl`, a quantidade de água identificada na mensagem. Quando a intenção é `REGISTRAR_AGUA`, o agente calcula o percentual de uma meta diária fixa de 2.000 ml e informa quanto falta para atingir essa meta.

#### `Env`

Descreve as configurações disponíveis no ambiente do Cloudflare Worker:

- `AI`: binding do Workers AI;
- `WA_VERIFY_TOKEN`: token usado na verificação do webhook;
- `WA_APP_SECRET`: segredo da aplicação;
- `WA_API_ACCESS_TOKEN`: token de acesso à API do WhatsApp;
- `WA_PHONE_NUMBER_ID`: identificador do número usado pela API.

Esses nomes documentam o contrato entre o código e a infraestrutura. Os valores reais não devem ser escritos no código nem commitados no Git; devem ser configurados como segredos ou variáveis de ambiente. Como a conta Meta ainda não foi criada, esses segredos podem permanecer sem configuração durante a fase local.

### Atenção: nomes ainda precisam ser alinhados

O tipo `Env` declara `WA_VERIFY_TOKEN`, `WA_API_ACCESS_TOKEN` e `WA_PHONE_NUMBER_ID`. Já o `src/index.ts` consulta `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.

Esses nomes não são equivalentes automaticamente. A configuração do Wrangler e o tipo `Env` precisam usar uma única convenção; caso contrário, o Worker poderá receber `undefined` mesmo que um segredo tenha sido configurado com o outro nome.

Possíveis tipos futuros:

- formato da mensagem recebida do WhatsApp;
- formato da resposta enviada;
- estado de uma conversa;
- configuração do agente;

Os tipos de entrada e saída do WhatsApp ainda precisam ser definidos.

## Capítulo 3 — O primeiro cérebro do agente

O arquivo `src/agent/fitness-agent.ts` concentra a lógica de conversa do assistente. Ele exporta a classe `FitnessAgent`, que recebe as configurações do Worker e um nome opcional. Se nenhum nome for informado, usa `FitBot Pro`.

### O método público `processarMensagem`

Este é o ponto de entrada da lógica do agente. Ele recebe:

- `userId`: identificação do usuário;
- `mensagemTexto`: texto enviado pelo usuário.

O caminho percorrido, depois que o handler recebe uma mensagem de texto, é:

```text
mensagemTexto
  |
  v
interpretarComWorkersAI
  |
  v
intencaoIdentificada
  |
  +--> REGISTRAR_TREINO  -> resposta do treino
  |
  +--> REGISTRAR_PASSOS  -> resposta dos passos
  |
  +--> CONVERSA_GERAL    -> resposta textual da IA
  |
  v
mensagem de orientação se faltarem dados
```

O método já registra no console o nome do agente, o usuário e a mensagem recebida. O `userId` ainda é usado apenas nesse registro; ele não é persistido em banco de dados.

### A interpretação com Workers AI

O método privado `interpretarComWorkersAI` envia duas mensagens ao modelo:

1. uma instrução de sistema explicando o papel do FitBot e o formato JSON esperado;
2. a mensagem original do usuário.

O modelo utilizado é `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`. A resposta esperada contém uma intenção, dados extraídos e uma resposta textual.

O prompt atual lista `SPINNING`, `CALISTHENICS`, `WEIGHTLIFTING`, `WALKING` e `OTHER` como modalidades de treino. O tipo `TipoTreino` também permite `RUNNING`; essa diferença deverá ser alinhada para que o contrato TypeScript e a instrução enviada à IA tenham exatamente as mesmas opções.

Depois da chamada, o código:

- lê o campo `response` retornado pela IA;
- separa o conteúdo da tag `<think>`, quando ela existe;
- remove blocos Markdown como `````json`;
- converte o texto para um objeto com `JSON.parse`;
- guarda o raciocínio separado em `pensamentoIa`.

Essa etapa transforma linguagem natural, como “fiz 45 minutos de spinning”, em dados que o programa consegue tratar.

### Fallback heurístico

Se a chamada à IA falhar ou retornar um JSON inválido, o agente não encerra a conversa imediatamente. Ele registra o erro e usa `fallbackHeuristico`.

Essa regra simples procura palavras conhecidas:

- `spinning`, `treino` ou `calistenia` levam a um registro de treino;
- `spinning` vira `SPINNING`;
- `calistenia` vira `CALISTHENICS`;
- qualquer outra mensagem recebe uma saudação padrão.

No fallback, a duração padrão usada para um treino é de 40 minutos. Isso é útil como contingência de desenvolvimento, mas deverá ser refinado antes de um uso real, pois não substitui a extração correta dos dados.

### Registro de treino e calorias

`executarRegistroTreino` usa fatores estimados por modalidade:

| Modalidade | Fator usado |
| --- | ---: |
| `SPINNING` | 10.5 |
| `CALISTHENICS` | 8.0 |
| `WEIGHTLIFTING` | 6.0 |
| `WALKING` | 4.5 |
| `RUNNING` | 11.0 |
| `OTHER` | 5.5 |

A estimativa é calculada assim:

```text
calorias = duração em minutos × fator da modalidade
```

O resultado é arredondado e devolvido em uma mensagem motivacional. Apesar do nome “registro”, essa primeira versão ainda não salva o treino em banco; ela apenas monta a confirmação para o usuário.

### Registro de passos

`executarRegistroPassos` usa uma meta fixa de 7.000 passos. A resposta mostra:

- passos realizados;
- percentual da meta, limitado a 100%;
- uma barra visual com 10 posições;
- quantos passos faltam ou uma mensagem de meta alcançada.

Também é usado `toLocaleString('pt-BR')` para exibir os números no formato brasileiro.

## Capítulo 4 — O ecossistema Node.js e npm

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

## Capítulo 5 — Repetibilidade com `package-lock.json`

O `package-lock.json` é gerado pelo npm. Ele registra versões exatas das dependências instaladas e suas dependências internas.

A diferença principal é:

- `package.json` declara o que o projeto precisa;
- `package-lock.json` registra exatamente o que foi instalado.

Isso ajuda a fazer com que diferentes computadores instalem versões consistentes.

## Capítulo 6 — TypeScript: escrever com uma rede de segurança

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

## Capítulo 7 — Cloudflare Workers e Wrangler

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

O `src/index.ts` já recebe requisições HTTP. A lógica do `FitnessAgent` também já é chamada para mensagens de texto no `POST /webhook`, e a resposta é enviada pela Meta Graph API através de `responderWhatsApp`.

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

Na prática, o `FitnessAgent` recebe esse recurso pelo objeto de ambiente e já o utiliza para chamadas de IA. O binding de AI sempre acessa um recurso remoto; no modo local, o Wrangler informa que ele não é simulado localmente e pode gerar custos.

Para desenvolvimento local, o comando `npm run dev:local` inicia o Worker na porta `8787`, sem exigir um subdomínio `workers.dev`. Como alternativa, `npx wrangler dev` pode usar o modo remoto, mas exige que um subdomínio `workers.dev` esteja registrado na conta Cloudflare.

### Binding do banco D1

O `wrangler.jsonc` agora possui um binding `DB` apontando para o banco `whatsapp-fitness-agent-db`. O binding permite que o Worker use `env.DB` para executar comandos SQL sem chamar uma API externa.

Para repetir as migrações, use:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

O primeiro comando atualiza o banco local. O segundo atualiza o banco remoto da Cloudflare. Migrações devem ser aplicadas na ordem e não devem ser editadas depois de aplicadas em produção; para mudanças futuras, crie um novo arquivo numerado.

### Observabilidade

```json
"observability": {
  "enabled": true
}
```

Ativa recursos de observabilidade do Worker, que podem ajudar a acompanhar logs, métricas e problemas durante a execução.

## Capítulo 8 — O que já foi preparado

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
15. A classe `FitnessAgent` foi adicionada para interpretar mensagens e produzir respostas.
16. A integração inicial com o Workers AI foi implementada.
17. Foi criado um fallback heurístico para lidar com falhas da IA.
18. Foram implementadas respostas para registro de treinos e acompanhamento de passos.
19. Foi implementado o registro de água com meta diária de 2.000 ml.
20. Foi criado o `fetch` handler do Cloudflare Worker.
21. Foi implementada a validação inicial do webhook da Meta em requisições `GET`.
22. Foi implementado o recebimento de mensagens de texto em `POST /webhook`.
23. O handler passou a encaminhar mensagens ao `FitnessAgent`.
24. Foi implementada a função `responderWhatsApp` para chamar a Meta Graph API v18.0.
25. O Worker passou a enviar respostas de texto ao número que originou a mensagem.
26. Foi adicionado o comando `npm run dev:local` para iniciar o Worker em modo local.
27. Foi testada a inicialização com `npx wrangler dev`; o modo remoto foi bloqueado pela ausência de um subdomínio `workers.dev`.
28. Foi testado um POST com mensagem de treino e água, que retornou `200` com uma resposta JSON usando JSON serializado corretamente.
29. O fallback passou a preservar a duração informada pelo usuário, como os 45 minutos do exemplo.
30. O POST passou a devolver a confirmação gerada pelo agente diretamente na resposta HTTP.
31. Foi criado o banco D1 `whatsapp-fitness-agent-db`.
32. Foram criadas as tabelas de registros de treino e métricas diárias.
33. O `FitnessRepository` foi conectado ao agente para persistir treinos, passos e água.
34. A migração foi aplicada nos ambientes local e remoto.
35. Foram adicionados comandos npm para repetir as migrações.
23. Foi implementada a função `responderWhatsApp` para chamar a Meta Graph API v18.0.
24. O Worker passou a enviar respostas de texto ao número que originou a mensagem.
25. Foi testada a inicialização com `npx wrangler dev`; o modo remoto foi bloqueado pela ausência de um subdomínio `workers.dev`.

## Capítulo 9 — O que ainda não foi feito

Os seguintes itens ainda estão pendentes:

- validação de autenticação e assinatura dos webhooks;
- definição dos tipos das mensagens recebidas e enviadas pelo WhatsApp;
- suporte a outros tipos de mensagem além de texto;
- configuração final do modo local ou do subdomínio `workers.dev` para executar o Worker;
- validação dos nomes das variáveis de ambiente usados pelo código e pelos tipos;
- verificação da resposta da Meta Graph API e tratamento de falhas de envio;
- validação do JSON recebido da IA com mais segurança;
- tratamento de `CONSULTAR_PROGRESSO`;
- validação de durações, passos e valores negativos;
- substituição de `AI: any` por um tipo mais específico;
- configuração de variáveis de ambiente e segredos;
- armazenamento do histórico das conversas;
- tratamento de erros;
- testes automatizados;
- definição de um script de teste real;
- publicação do Worker na Cloudflare.

## Capítulo 10 — Git: o diário de bordo do projeto

Git é um sistema de controle de versão. Ele registra fotografias organizadas do projeto ao longo do tempo, chamadas **commits**. Assim, é possível saber o que mudou, quando mudou e por quê.

### O que aconteceu agora

O comando abaixo foi executado:

```bash
git init
```

Esse comando criou um repositório Git local na pasta do projeto. Desde então, já foram registrados commits com a estrutura inicial, a documentação, o `.gitignore` e os tipos do domínio fitness.

Arquivos novos aparecem como não rastreados (`??`) até serem adicionados com `git add`. Depois do commit, deixam de ser apenas arquivos locais e passam a fazer parte do histórico do projeto.

O diretório `node_modules/` é ignorado pelo `.gitignore`, pois pode ser recriado com `npm install`. O mesmo vale para arquivos locais como `.env`, que podem conter segredos.

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

## Capítulo 11 — Comandos úteis

Instalar as dependências:

```bash
npm install
```

Verificar o TypeScript sem gerar arquivos:

```bash
npx tsc --noEmit
```

Iniciar o Worker localmente com o Wrangler:

```bash
npx wrangler dev
```

Para executar sem exigir um subdomínio `workers.dev`, use:

```bash
npm run dev:local
```

Nos testes atuais, o servidor local foi iniciado em `http://127.0.0.1:8787`. O binding de AI continua remoto e o Wrangler avisa que ele pode gerar custos.

### Executar o frontend Angular

Com o Worker rodando, abra outro terminal na raiz do projeto e instale as dependências do cliente:

```bash
npm run client:install
```

Inicie o frontend:

```bash
npm run client:start
```

A aplicação ficará disponível em `http://localhost:4200` e usará o endpoint local `http://127.0.0.1:8787/api/chat`. Para executar o cliente e o Worker ao mesmo tempo, mantenha cada comando em um terminal separado.

Para gerar o build de produção:

```bash
npm run client:build
```

Os arquivos serão gerados em `client/dist/fitness-agent-client/browser`.

### Verificar requisições e logs do Worker

Para acompanhar as requisições do Worker publicado em tempo real:

```bash
npx wrangler tail whatsapp-fitness-agent
```

Depois envie uma mensagem pelo frontend ou pelo WhatsApp. O terminal exibirá requisições, logs do `console.log()`, erros e falhas na API do WhatsApp. Para filtrar apenas requisições com erro:

```bash
npx wrangler tail whatsapp-fitness-agent --status error
```

Interrompa o acompanhamento com `Ctrl+C`. Nos logs do agente, a mensagem `Resposta estruturada recebida do Workers AI` indica que a resposta da IA foi processada. Já `Erro ao executar Workers AI, usando fallback heurístico` indica que o fallback foi usado.

Publicar o Worker na Cloudflare, depois que a conta e as credenciais estiverem configuradas:

```bash
npx wrangler deploy
```

Executar os testes:

```bash
npm test
```

No estado atual, `npm test` ainda falha propositalmente porque nenhum teste foi configurado.

### Testes manuais realizados

O Worker foi iniciado com `npm run dev:local` e ficou disponível em `http://127.0.0.1:8787`.

- A validação GET do webhook retornou `403` quando o token local não foi configurado. Esse é o comportamento esperado para um token ausente ou incorreto.
- Um primeiro POST retornou `500` porque o PowerShell enviou um JSON inválido, sem as aspas esperadas nas propriedades.
- O mesmo POST foi repetido usando `ConvertTo-Json -Depth 10` e retornou `200` com a confirmação do agente em JSON.
- O último treino foi consultado no D1 local e apareceu como `SPINNING`, 45 minutos e 473 kcal para o usuário `5511999998888`.

### Ajustes de confiabilidade

As falhas de envio para a Meta Graph API agora são lançadas como erro. Com isso, o webhook responde `500` quando a mensagem não consegue ser enviada, em vez de confirmar silenciosamente uma operação incompleta.

O cliente web não afirma mais que o servidor está “Online” sem realizar uma verificação. O cabeçalho usa o estado neutro `Pronto para conversar`, que não promete uma conexão que ainda não foi testada.

Consultas frequentes agora são respondidas por regras locais antes da chamada ao Workers AI. Isso reduz o consumo da cota de neurônios e consulta diretamente o D1 para mensagens como:

- `o que registrei hoje`;
- `quanto de água bebi`;
- `meus treinos`;
- `quantos passos dei`.

As consultas de água e passos retornam os totais do dia. A consulta do histórico de hoje filtra treinos e alimentos pela data atual. Quando nenhuma regra local é identificada, o fluxo continua usando o Workers AI normalmente.

Os manifests do projeto e do cliente declaram Node `22.22.3` ou superior, requisito do Angular CLI usado pelo frontend. Confira a versão instalada com `node --version` antes de executar o build.

O perfil `worker-startup.cpuprofile`, gerado pelo comando `wrangler check startup`, também passou a ser ignorado pelo Git por ser um artefato local de diagnóstico.

O teste confirma que o Worker consegue receber o evento e percorrer o handler. Para confirmar o envio pela Meta Graph API, ainda são necessárias credenciais válidas e variáveis `WHATSAPP_*` configuradas.

O Worker está publicado em `https://whatsapp-fitness-agent.andreluiscelis.workers.dev`. A versão que inclui as consultas locais é `ca01d069-b7ec-49d0-9621-ffd3c5183475`.

### Como testar com Postman

O Postman é um programa para enviar requisições HTTP manualmente. Ele funciona como um carteiro de testes: você escolhe o endereço, o método, os cabeçalhos e o conteúdo da mensagem, e observa a resposta do Worker.

#### Passo 1: iniciar o Worker

Abra um terminal na pasta do projeto e execute:

```bash
npm run dev:local
```

O terminal deverá informar que o servidor está disponível em:

```text
http://127.0.0.1:8787
```

Mantenha esse terminal aberto enquanto usar o Postman. Se o servidor for encerrado, o Postman não encontrará o endpoint.

#### Passo 2: criar a requisição POST

No Postman, crie uma nova requisição com estas configurações:

- método: `POST`;
- URL: `http://127.0.0.1:8787/webhook`;
- aba **Headers**: adicione `Content-Type` com valor `application/json`;
- aba **Body**: selecione `raw` e depois `JSON`.

Cole este conteúdo no corpo:

```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "messages": [
              {
                "from": "5511999998888",
                "type": "text",
                "text": {
                  "body": "Fiz 45 minutos de spinning hoje"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

Clique em **Send**. O Worker extrairá o remetente e o texto, enviará a mensagem ao `FitnessAgent` e tentará encaminhar a resposta à Meta Graph API.

#### Passo 3: entender a resposta

Quando o processamento terminar, o Postman deverá mostrar status `200` e um JSON parecido com este:

```json
{
  "status": "ok",
  "message": "Mensagem processada com sucesso",
  "response": "💪 **Excelente Treino Registrado!**\n• **Modalidade:** SPINNING\n• **Duração:** 45 minutos\n• **Gasto Estimado:** ~473 kcal\n\nA disciplina supera a motivação. Parabéns pelo esforço de hoje! 🔥"
}
```

O valor exato das calorias pode variar se o Workers AI interpretar a mensagem de outra forma. No fallback local, 45 minutos de spinning resultam em aproximadamente 473 kcal.

#### Passo 4: testar água e passos

Para testar hidratação, troque apenas o valor de `text.body`:

```json
"body": "Bebi 600 ml de água"
```

Para testar passos:

```json
"body": "Dei 8000 passos"
```

O agente usa uma meta diária de 2.000 ml para água e 7.000 passos para caminhada diária.

#### Passo 5: testar a validação do webhook

Crie uma segunda requisição no Postman:

- método: `GET`;
- URL: `http://127.0.0.1:8787/webhook?hub.mode=subscribe&hub.verify_token=teste&hub.challenge=abc123`.

Sem configurar `WHATSAPP_VERIFY_TOKEN`, o resultado esperado é status `403` com a mensagem `Token de verificação inválido`. Para testar o cenário de sucesso, crie um arquivo `.dev.vars` na raiz do projeto:

```env
WHATSAPP_VERIFY_TOKEN=teste
```

Reinicie o Worker e envie a mesma requisição. O resultado esperado será status `200` e o corpo `abc123`.

O arquivo `.dev.vars` é apenas para desenvolvimento local e não deve ser commitado. Nunca coloque tokens reais no corpo de uma requisição, em screenshots do Postman ou em arquivos versionados.

#### Diagnóstico rápido

| Resultado | Significado provável | Ação |
| --- | --- | --- |
| `ECONNREFUSED` | Worker desligado ou porta incorreta | Execute `npm run dev:local` e use a porta `8787` |
| `403` no GET | Token ausente ou diferente | Confira o `.dev.vars` e reinicie o Worker |
| `500` no POST | JSON inválido ou falha durante processamento | Confira o Body como `raw`/`JSON` e veja os logs do terminal |
| `200` sem resposta de WhatsApp | Evento foi processado, mas a Meta não está configurada | Configure a conta Meta e os segredos reais |

O Postman testa o Worker localmente. Ele não transforma o endpoint em um webhook público nem substitui a configuração da conta Meta Business.

### Desenvolvimento sem Meta Business

Sem uma conta Meta, o fluxo que pode ser testado é:

```text
curl local
  |
  v
Worker local
  |
  v
FitnessAgent + Workers AI
  |
  v
EVENT_RECEIVED
```

Esse teste confirma o recebimento do JSON, o processamento do evento e o formato da resposta HTTP. Ele não simula a entrega de uma mensagem pelo WhatsApp nem confirma o envio pela Meta Graph API.

Para uma simulação completa sem credenciais, o próximo ajuste recomendado é criar um modo de desenvolvimento que apenas registre a resposta no console e não chame a Meta Graph API. Esse modo deve ficar desativado em produção.

## Capítulo 12 — Próxima etapa recomendada

A próxima etapa depende do objetivo imediato. Para continuar estudando, use `npm run dev:local` e teste com `curl`. Para operar no WhatsApp real, primeiro crie a estrutura Meta Business e só então configure as variáveis de ambiente e teste a chamada da Meta Graph API com credenciais válidas. A função `responderWhatsApp` já conecta a resposta do agente à API.

Uma sequência segura de desenvolvimento seria:

1. continuar os testes locais com `npm run dev:local`;
2. criar a conta e o aplicativo Meta Business quando a integração real for necessária;
3. configurar os segredos `WHATSAPP_*` com valores reais;
4. validar o webhook público;
5. testar o envio pela Meta Graph API;
6. criar os tipos das mensagens e tratar mensagens que não sejam texto;
7. adicionar testes e publicar.

## Capítulo 13 — Pequeno dicionário de tecnologia

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

## Capítulo 14 — Critério de pronto

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
