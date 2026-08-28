import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UsuarioInfo {
  id: string;
  nome: string;
  email: string;
}

export interface LoginResponse {
  token: string;
  usuario: UsuarioInfo;
  expiraEm: number;
}

export interface ChatResponse {
  resposta: string;
  sugestoes?: string[];
}

const CHAVE_SESSAO = 'fitbot.sessao';

interface Sessao {
  token: string;
  usuario: UsuarioInfo;
  expiraEm: number;
}

@Injectable({ providedIn: 'root' })
export class FitnessChatService {
  private readonly http: HttpClient;
  private readonly baseAuthUrl = environment.apiUrl.replace(/\/api\/chat$/, '');

  constructor(http: HttpClient) {
    this.http = http;
  }

  /** Cria a conta (nome, e-mail único e senha) e já devolve o token de acesso. */
  registrar(nome: string, email: string, senha: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseAuthUrl}/api/auth/registro`, { nome, email, senha });
  }

  /** Autentica com e-mail/senha e devolve a sessão (token + usuário + expiração). */
  login(email: string, senha: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseAuthUrl}/api/auth/login`, { email, senha });
  }

  /** Envia mensagem autenticada — o userId agora vem do token no servidor. */
  enviarMensagem(mensagem: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(
      environment.apiUrl,
      { mensagem },
      { headers: this.headersAutenticados() }
    );
  }

  /** Restaura a sessão salva (token ainda válido?). */
  obterSessao(): Sessao | null {
    try {
      const bruto = localStorage.getItem(CHAVE_SESSAO);
      if (!bruto) return null;

      const sessao = JSON.parse(bruto) as Sessao;
      if (!sessao?.token || !sessao?.usuario || sessao.expiraEm <= Date.now()) {
        this.logout();
        return null;
      }
      return sessao;
    } catch {
      return null;
    }
  }

  /** Encerra a sessão local. */
  logout(): void {
    localStorage.removeItem(CHAVE_SESSAO);
  }

  /** Persiste a sessão localmente (após login/registro bem-sucedido). */
  armazenarSessao(resposta: LoginResponse): void {
    const sessao: Sessao = {
      token: resposta.token,
      usuario: resposta.usuario,
      expiraEm: resposta.expiraEm
    };
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  }

  private headersAutenticados(): HttpHeaders {
    const sessao = this.obterSessao();
    return new HttpHeaders({ Authorization: `Bearer ${sessao?.token ?? ''}` });
  }
}
