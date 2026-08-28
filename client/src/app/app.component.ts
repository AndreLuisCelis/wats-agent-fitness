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

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  template: `
    <main class="pagina">
      <section class="chat autenticacao" *ngIf="!autenticado" aria-label="Acesso ao FitBot Pro">
        <header class="cabecalho">
          <div class="marca">F</div>
          <div><h1>FitBot Pro</h1><p>Acesse para registrar seus hábitos</p></div>
        </header>

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

          <button type="submit" [disabled]="processandoAuth || !formularioAuthValido()">
            {{ processandoAuth ? 'Aguarde…' : (modoAuth === 'login' ? 'Entrar' : 'Criar conta e entrar') }}
          </button>
        </form>
      </section>

      <section class="chat" *ngIf="autenticado" aria-label="Conversa com o assistente fitness">
        <header class="cabecalho">
          <div class="marca">F</div>
          <div><h1>FitBot Pro</h1><p>Seu assistente de hábitos e treinos</p></div>
          <span class="status"><i></i> {{ usuarioAutenticado }}</span>
          <button type="button" class="sair" (click)="sair()">Sair</button>
        </header>

        <div #historico class="historico" aria-live="polite">
          <ng-container *ngFor="let item of mensagens">
            <article class="mensagem" [class.usuario]="item.autor === 'usuario'">
              <span>{{ item.texto }}</span>
            </article>
            <div class="sugestoes-msg" *ngIf="item.sugestoes?.length" role="group" aria-label="Sugestões de mensagem">
              <button *ngFor="let sugestao of item.sugestoes" type="button" [disabled]="enviando" (click)="usarSugestao(sugestao)">{{ sugestao }}</button>
            </div>
          </ng-container>
          <div *ngIf="enviando" class="digitando" aria-label="FitBot está respondendo"><b></b><b></b><b></b></div>
        </div>

        <div class="sugestoes" *ngIf="mensagens.length === 1">
          <button *ngFor="let sugestao of sugestoes" type="button" (click)="usarSugestao(sugestao)">{{ sugestao }}</button>
        </div>

        <form class="entrada" (ngSubmit)="enviar()">
          <label class="sr-only" for="mensagem">Sua mensagem</label>
          <textarea id="mensagem" [(ngModel)]="mensagem" name="mensagem" rows="1"
            placeholder="Ex.: Fiz 45 min de spinning" [disabled]="enviando" (keydown.enter)="enviarComEnter($event)"></textarea>
          <button type="submit" [disabled]="enviando || !mensagem.trim()">Enviar</button>
        </form>
        <p class="aviso">As calorias são estimativas e não substituem orientação profissional.</p>
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
