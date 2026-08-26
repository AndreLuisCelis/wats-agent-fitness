import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface ChatResponse {
  resposta: string;
}

@Injectable({ providedIn: 'root' })
export class FitnessChatService {
  constructor(private readonly http: HttpClient) {}

  enviarMensagem(userId: string, mensagem: string) {
    return this.http.post<ChatResponse>(environment.apiUrl, { userId, mensagem });
  }
}
