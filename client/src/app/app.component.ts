import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, ViewChild, inject } from '@angular/core';
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
      <section class="chat" aria-label="Conversa com o assistente fitness">
        <header class="cabecalho">
          <div class="marca">F</div>
          <div><h1>FitBot Pro</h1><p>Seu assistente de hábitos e treinos</p></div>
          <span class="status"><i></i> Pronto para conversar</span>
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
export class AppComponent {
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
  private readonly userId = this.obterUserId();

  enviar(): void {
    const texto = this.mensagem.trim();
    if (!texto || this.enviando) return;

    this.mensagens.push({ autor: 'usuario', texto });
    this.mensagem = '';
    this.enviando = true;
    this.rolarParaFim();

    this.chat.enviarMensagem(this.userId, texto)
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
        error: () => {
          this.mensagens.push({
            autor: 'agente',
            texto: 'Não consegui falar com o servidor agora. Verifique se o Worker está em execução e tente novamente.'
          });
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

  private obterUserId(): string {
    const chave = 'fitbot-user-id';
    const existente = localStorage.getItem(chave);
    if (existente) return existente;
    const novo = crypto.randomUUID();
    localStorage.setItem(chave, novo);
    return novo;
  }

  private rolarParaFim(): void {
    setTimeout(() => {
      const elemento = this.historico?.nativeElement;
      if (elemento) elemento.scrollTop = elemento.scrollHeight;
    });
  }
}
