import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { FitnessChatService } from './services/fitness-chat.service';

interface Mensagem {
  autor: 'usuario' | 'agente';
  texto: string;
  sugestoes?: string[];
}

/** Bloco renderizável de uma mensagem do agente: texto formatado ou barra de progresso. */
interface BlocoMensagem {
  tipo: 'texto' | 'barra';
  conteudo?: string;
  pct?: number;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  template: `
    <main class="pagina">
      <section class="tela autenticacao" *ngIf="!autenticado" aria-label="Acesso ao FitBot Pro">
        <button type="button" class="icone-botao tema-flutuante" (click)="alternarTema()" [attr.aria-label]="rotuloTema()">
          <svg *ngIf="tema === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
          <svg *ngIf="tema === 'light'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        </button>

        <div class="auth-caixa">
          <div class="marca grande" aria-hidden="true">F</div>
          <h1 class="auth-titulo">{{ modoAuth === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta' }}</h1>
          <p class="auth-subtitulo">Acesse para registrar treinos, passos e hidratação.</p>

          <form class="auth-form" (ngSubmit)="entrar()">
            <div class="alternancia" role="group" aria-label="Entrar ou criar conta">
              <button type="button" [class.ativo]="modoAuth === 'login'" (click)="alternarModo('login')">Entrar</button>
              <button type="button" [class.ativo]="modoAuth === 'registro'" (click)="alternarModo('registro')">Criar conta</button>
            </div>

            <ng-container *ngIf="modoAuth === 'registro'">
              <label for="nome">Nome</label>
              <input id="nome" name="nome" [(ngModel)]="nome" autocomplete="name"
                placeholder="ex.: André Celis" [disabled]="processandoAuth" />
            </ng-container>

            <label for="email">E-mail</label>
            <input id="email" name="email" type="email" [(ngModel)]="email" autocomplete="email"
              placeholder="voce@email.com" [disabled]="processandoAuth" />

            <label for="senha">Senha (mínimo 6 caracteres)</label>
            <input id="senha" name="senha" type="password" [(ngModel)]="senha"
              [autocomplete]="modoAuth === 'login' ? 'current-password' : 'new-password'"
              placeholder="••••••" [disabled]="processandoAuth" />

            <p class="erro-auth" *ngIf="erroAuth" role="alert">{{ erroAuth }}</p>

            <button type="submit" class="primario" [disabled]="processandoAuth || !formularioAuthValido()">
              {{ processandoAuth ? 'Aguarde…' : (modoAuth === 'login' ? 'Entrar' : 'Criar conta e entrar') }}
            </button>
          </form>
        </div>
      </section>

      <section class="tela conversa" *ngIf="autenticado" aria-label="Conversa com o assistente fitness">
        <header class="cabecalho">
          <div class="marca" aria-hidden="true">F</div>
          <span class="titulo">FitBot Pro</span>
          <div class="acoes">
            <span class="status"><i></i> {{ usuarioAutenticado }}</span>
            <button type="button" class="icone-botao" (click)="alternarTema()" [attr.aria-label]="rotuloTema()">
              <svg *ngIf="tema === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
              <svg *ngIf="tema === 'light'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            </button>
            <button type="button" class="sair" (click)="sair()">Sair</button>
          </div>
        </header>

        <div #historico class="historico" aria-live="polite">
          <div class="conteudo">
            <div class="vazio" *ngIf="mensagens.length === 1">
              <h2>Em que podemos ajudar hoje?</h2>
              <p>Conte seu treino, passos, hidratação ou alimentação.</p>
              <div class="sugestoes" role="group" aria-label="Sugestões de mensagem">
                <button *ngFor="let sugestao of sugestoes" type="button" (click)="usarSugestao(sugestao)">{{ sugestao }}</button>
              </div>
            </div>

            <ng-container *ngFor="let item of mensagens; let indice = index">
              <article class="mensagem" *ngIf="indice > 0 || item.autor === 'usuario'"
                [class.usuario]="item.autor === 'usuario'">
                <span *ngIf="item.autor === 'usuario'">{{ item.texto }}</span>
                <ng-container *ngIf="item.autor === 'agente'">
                  <ng-container *ngFor="let bloco of blocosDaMensagem(item.texto)">
                    <div class="barra-progresso" *ngIf="bloco.tipo === 'barra'" role="progressbar"
                      [attr.aria-valuenow]="bloco.pct" aria-valuemin="0" aria-valuemax="100"
                      [attr.aria-label]="'Progresso: ' + bloco.pct + '%'">
                      <span class="preenchido" [style.width.%]="bloco.pct"></span>
                    </div>
                    <span *ngIf="bloco.tipo === 'texto'" [innerHTML]="bloco.conteudo"></span>
                  </ng-container>
                </ng-container>
              </article>
              <div class="sugestoes-msg" *ngIf="item.sugestoes?.length" role="group" aria-label="Sugestões de mensagem">
                <button *ngFor="let sugestao of item.sugestoes" type="button" [disabled]="enviando"
                  (click)="usarSugestao(sugestao)">{{ sugestao }}</button>
              </div>
            </ng-container>

            <div *ngIf="enviando" class="digitando" aria-label="FitBot está respondendo"><b></b><b></b><b></b></div>
          </div>
        </div>

        <div class="rodape">
          <form class="entrada" (ngSubmit)="enviar()">
            <label class="sr-only" for="mensagem">Sua mensagem</label>
            <textarea id="mensagem" [(ngModel)]="mensagem" name="mensagem" rows="1"
              placeholder="Envie uma mensagem… ex.: Fiz 45 min de spinning" [disabled]="enviando"
              (keydown.enter)="enviarComEnter($event)"></textarea>
            <button type="submit" class="enviar" [disabled]="enviando || !mensagem.trim()" aria-label="Enviar mensagem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
              </svg>
            </button>
          </form>
          <p class="aviso">As calorias são estimativas e não substituem orientação profissional.</p>
        </div>
      </section>
    </main>
  `,
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  @ViewChild('historico') historico?: ElementRef<HTMLElement>;
  private readonly chat = inject(FitnessChatService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  readonly sugestoes = ['Registrei 8.000 passos', 'Bebi 600 ml de água', 'Fiz 30 min de corrida'];
  /** Tema atual da interface ('light' ou 'dark'), no padrão claro/escuro do ChatGPT. */
  tema: 'light' | 'dark' = 'light';
  readonly mensagens: Mensagem[] = [{
    autor: 'agente',
    texto: 'Olá! Eu sou o FitBot Pro. Conte seu treino, passos ou hidratação de hoje. 💪'
  }];
  mensagem = '';
  enviando = false;
  autenticado = false;
  modoAuth: 'login' | 'registro' = 'login';
  nome = '';
  email = '';
  senha = '';
  erroAuth = '';
  processandoAuth = false;
  usuarioAutenticado = '';

  ngOnInit(): void {
    // O tema já foi aplicado pelo script inline do index.html; aqui apenas sincronizamos o estado.
    this.tema = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const sessao = this.chat.obterSessao();
    if (sessao?.usuario) {
      this.autenticado = true;
      this.usuarioAutenticado = sessao.usuario.nome || sessao.usuario.email;
    }
  }

  alternarModo(modo: 'login' | 'registro'): void {
    this.modoAuth = modo;
    this.erroAuth = '';
  }

  /** Alterna entre tema claro e escuro, persistindo a escolha (padrão do ChatGPT). */
  alternarTema(): void {
    this.tema = this.tema === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.tema);
    try {
      localStorage.setItem('fitbot-tema', this.tema);
    } catch {
      // Armazenamento indisponível (ex.: navegação privada) — apenas não persistimos.
    }
    this.changeDetector.detectChanges();
  }

  /** Rótulo acessível do botão de alternância de tema. */
  rotuloTema(): string {
    return this.tema === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro';
  }

  private static readonly CARACTERES_CHEIOS = /[\u2588\u2589-\u258F\u2593]/g;
  private static readonly CARACTERES_VAZIOS = /[\u2591\u2592\u25AC\u2500-\u2503]/g;

  /**
   * Divide a resposta do agente em blocos renderizáveis: o texto com **negrito**
   * convertido em <strong> e a barra desenhada em caracteres de bloco (ex.: [▓▓▓░░░])
   * convertida em uma barra de progresso estilizada em CSS.
   */
  blocosDaMensagem(texto: string): BlocoMensagem[] {
    const blocos: BlocoMensagem[] = [];
    let textoPendente = '';
    const descarregar = (): void => {
      const conteudo = AppComponent.formatarInline(textoPendente);
      if (conteudo) blocos.push({ tipo: 'texto', conteudo });
      textoPendente = '';
    };

    for (const linha of texto.split('\n')) {
      const pct = AppComponent.percentualDaBarra(linha);
      if (pct === null) {
        textoPendente += (textoPendente ? '\n' : '') + linha;
      } else {
        descarregar();
        blocos.push({ tipo: 'barra', pct });
      }
    }
    descarregar();
    return blocos;
  }

  /** Detecta linhas que contêm apenas a barra em caracteres de bloco e extrai o percentual preenchido. */
  private static percentualDaBarra(linha: string): number | null {
    const cheios = (linha.match(AppComponent.CARACTERES_CHEIOS) ?? []).length;
    const vazios = (linha.match(AppComponent.CARACTERES_VAZIOS) ?? []).length;
    if (cheios + vazios < 3) return null;
    const sobra = linha
      .replace(AppComponent.CARACTERES_CHEIOS, '')
      .replace(AppComponent.CARACTERES_VAZIOS, '')
      .replace(/[\s\[\]()|•─]/g, '');
    if (sobra.length > 0) return null;
    return Math.round((cheios / (cheios + vazios)) * 100);
  }

  /** Escapa HTML e converte **negrito** em <strong> (renderizado via [innerHTML], sanitizado pelo Angular). */
  private static formatarInline(texto: string): string {
    const escapado = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escapado.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  }

  private emailValido(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /** Habilita o botão de entrar/criar conta conforme o modo. */
  formularioAuthValido(): boolean {
    if (!this.emailValido(this.email.trim()) || this.senha.length < 6) return false;
    if (this.modoAuth === 'registro' && this.nome.trim().length < 2) return false;
    return true;
  }

  entrar(): void {
    const nome = this.nome.trim();
    const email = this.email.trim().toLowerCase();
    const senha = this.senha;
    if (this.processandoAuth || !this.formularioAuthValido()) return;

    this.processandoAuth = true;
    this.erroAuth = '';
    this.changeDetector.detectChanges();

    const chamada = this.modoAuth === 'login'
      ? this.chat.login(email, senha)
      : this.chat.registrar(nome, email, senha);

    chamada
      .pipe(finalize(() => {
        this.processandoAuth = false;
        this.changeDetector.detectChanges();
      }))
      .subscribe({
        next: (resposta) => {
          this.chat.armazenarSessao(resposta);
          this.autenticado = true;
          this.usuarioAutenticado = resposta.usuario.nome || resposta.usuario.email;
          this.senha = '';
          this.changeDetector.detectChanges();
        },
        error: (erro: HttpErrorResponse) => {
          this.erroAuth = erro.error?.erro ?? 'Não foi possível conectar ao servidor. Tente novamente.';
          this.changeDetector.detectChanges();
        }
      });
  }

  sair(): void {
    this.chat.logout();
    this.autenticado = false;
    this.nome = '';
    this.email = '';
    this.senha = '';
    this.erroAuth = '';
    this.modoAuth = 'login';
    this.usuarioAutenticado = '';
    this.mensagens.length = 1;
    this.changeDetector.detectChanges();
  }

  enviar(): void {
    const texto = this.mensagem.trim();
    if (!texto || this.enviando) return;

    this.mensagens.push({ autor: 'usuario', texto });
    this.mensagem = '';
    this.enviando = true;
    this.rolarParaFim();

    this.chat.enviarMensagem(texto)
      .pipe(finalize(() => {
        this.enviando = false;
        this.changeDetector.detectChanges();
        this.rolarParaFim();
      }))
      .subscribe({
        next: ({ resposta, sugestoes }) => {
          this.mensagens.push({ autor: 'agente', texto: resposta, sugestoes });
          this.changeDetector.detectChanges();
        },
        error: (erro: HttpErrorResponse) => {
          if (erro.status === 401) {
            this.sair();
            this.erroAuth = 'Sua sessão expirou. Entre novamente.';
          } else {
            this.mensagens.push({
              autor: 'agente',
              texto: erro.error?.erro ?? 'Não consegui falar com o servidor agora. Tente novamente.'
            });
          }
          this.changeDetector.detectChanges();
        }
      });
  }

  usarSugestao(sugestao: string): void {
    this.mensagem = sugestao;
    this.enviar();
  }

  enviarComEnter(event: Event): void {
    const teclado = event as KeyboardEvent;
    if (!teclado.shiftKey) { teclado.preventDefault(); this.enviar(); }
  }

  private rolarParaFim(): void {
    setTimeout(() => {
      const elemento = this.historico?.nativeElement;
      if (elemento) elemento.scrollTop = elemento.scrollHeight;
    });
  }
}
