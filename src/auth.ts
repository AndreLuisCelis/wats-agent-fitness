/**
 * Autenticação do cliente web: hash de PIN e tokens JWT (HS256).
 * Implementada com Web Crypto para não adicionar dependências ao Worker.
 */

const encoder = new TextEncoder();

function bytesParaBase64url(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlParaTexto(valor: string): string {
  const base64 = valor.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return decodeURIComponent(
    binario
      .split('')
      .map((caractere) => '%' + caractere.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
}

async function assinarHmac(conteudo: string, secret: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const assinatura = await crypto.subtle.sign('HMAC', chave, encoder.encode(conteudo));
  return bytesParaBase64url(new Uint8Array(assinatura));
}

/** Comparação em tempo constante para evitar análise de timing. */
function comparacaoSegura(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** Salt aleatório de 128 bits para o hash do PIN de cada usuário. */
export function gerarSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesParaBase64url(bytes);
}

/** Deriva o hash da senha com PBKDF2-SHA256 (100.000 iterações) em base64url. */
export async function calcularHashSenha(senha: string, salt: string): Promise<string> {
  const chaveBase = await crypto.subtle.importKey(
    'raw',
    encoder.encode(senha),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100_000 },
    chaveBase,
    256
  );
  return bytesParaBase64url(new Uint8Array(bits));
}

interface CredencialToken {
  sub: string;
  exp: number;
}

/** Emite um JWT HS256 com o userId no campo `sub` e expiração em `validadeSegundos`. */
export async function criarToken(userId: string, secret: string, validadeSegundos = 86_400): Promise<string> {
  const header = bytesParaBase64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = bytesParaBase64url(
    encoder.encode(
      JSON.stringify({
        sub: userId,
        exp: Math.floor(Date.now() / 1000) + validadeSegundos
      })
    )
  );
  const assinatura = await assinarHmac(`${header}.${payload}`, secret);
  return `${header}.${payload}.${assinatura}`;
}

/** Valida assinatura e expiração do JWT; retorna o userId (`sub`) ou null. */
export async function verificarToken(token: string, secret: string): Promise<string | null> {
  const partes = token.split('.');
  if (partes.length !== 3) return null;

  const [header, payload, assinatura] = partes;
  const assinaturaEsperada = await assinarHmac(`${header}.${payload}`, secret);
  if (!comparacaoSegura(assinaturaEsperada, assinatura)) return null;

  let credencial: CredencialToken;
  try {
    credencial = JSON.parse(base64urlParaTexto(payload));
  } catch {
    return null;
  }

  if (!credencial?.sub || typeof credencial.exp !== 'number') return null;
  if (credencial.exp * 1000 < Date.now()) return null;
  return credencial.sub;
}

/** Extrai o token do header `Authorization: Bearer <token>`. */
export function extrairTokenAutorizacao(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const correspondencia = header.match(/^Bearer\s+(.+)$/i);
  return correspondencia ? correspondencia[1].trim() : null;
}