import type { EmailProvider, EmailSendInput, EmailSendResult } from './types';

// Microsoft Graph — envia via POST /users/{sender}/sendMail.
// Auth: OAuth2 client_credentials (app-only, sem usuário logado).
// Requer app registration no Azure AD com permissão Mail.Send (Application).

type MSGraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderEmail: string;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number; // epoch ms
};

export class MSGraphEmailProvider implements EmailProvider {
  readonly name = 'msgraph';

  private config: MSGraphConfig;
  private tokenCache: TokenCache | null = null;

  constructor(config: MSGraphConfig) {
    if (!config.tenantId || !config.clientId || !config.clientSecret) {
      throw new Error('MSGRAPH_TENANT_ID, MSGRAPH_CLIENT_ID and MSGRAPH_CLIENT_SECRET are required');
    }
    this.config = config;
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    let accessToken: string;
    try {
      accessToken = await this.getAccessToken();
    } catch (err) {
      return {
        ok: false,
        error: `msgraph auth: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
        provider: this.name,
      };
    }

    const body = {
      message: {
        subject: input.subject,
        body: { contentType: 'HTML' as const, content: input.html },
        from: {
          // MS Graph só pode enviar pela própria caixa (senderEmail). Usar
          // outro endereço no From dá 403 ErrorSendAsDenied. Forçamos o
          // From = senderEmail e preservamos o nome de exibição.
          emailAddress: { address: this.config.senderEmail, name: input.fromName },
        },
        toRecipients: [
          { emailAddress: { address: input.to.email, name: input.to.name } },
        ],
        // Respostas vão pro endereço de marca (fromEmail), não pra caixa técnica.
        replyTo: (input.replyTo ?? input.fromEmail)
          ? [{ emailAddress: { address: input.replyTo ?? input.fromEmail } }]
          : undefined,
        // MS Graph só aceita internetMessageHeaders com prefixo x-/X-.
        // Headers padrão (List-Unsubscribe, List-Unsubscribe-Post) são
        // rejeitados com 400 InvalidInternetMessageHeader — então filtramos.
        // O link de descadastro no corpo do e-mail cobre o opt-out.
        internetMessageHeaders: (() => {
          if (!input.headers) return undefined;
          const allowed = Object.entries(input.headers)
            .filter(([name]) => /^x-/i.test(name))
            .map(([name, value]) => ({ name, value }));
          return allowed.length ? allowed : undefined;
        })(),
      },
      saveToSentItems: false,
    };

    const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.senderEmail)}/sendMail`;

    let response: Response;
    try {
      response = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return {
        ok: false,
        error: `network: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
        provider: this.name,
      };
    }

    // Graph retorna 202 Accepted sem body quando o envio é aceito
    if (response.ok || response.status === 202) {
      return {
        ok: true,
        providerId: `msgraph-${Date.now()}`,
        provider: this.name,
      };
    }

    const errorText = await response.text();
    const retryable = response.status >= 500 || response.status === 429;
    return {
      ok: false,
      error: `msgraph http ${response.status}: ${errorText.slice(0, 500)}`,
      retryable,
      provider: this.name,
    };
  }

  getRateLimits() {
    return { perSecond: 5, perDay: 10000 };
  }

  // ── Token management ────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`token request failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    // Renew 60s before expiry to avoid edge-case failures
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    return data.access_token;
  }
}
