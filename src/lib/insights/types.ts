// Tipos do schema insights.* — usamos raw SQL pra Insights por enquanto
// (não duplicamos em Drizzle pra não dobrar manutenção; quando migrarmos
// crons/admin, considerar adicionar Drizzle schema).

export type Category =
  | 'politica'
  | 'sala_de_aula'
  | 'pesquisa'
  | 'ferramentas'
  | 'etica';

export type DraftStatus = 'pending' | 'approved' | 'published' | 'rejected' | 'failed';

export type SubscriberStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'unsubscribed'
  | 'bounced'
  | 'complained';

export type Locale = 'pt' | 'en';

export interface Article {
  id: string;
  category: Category;
  published_at: string;
  title_pt: string;
  title_en: string;
  slug_pt: string;
  slug_en: string;
  excerpt_pt: string;
  excerpt_en: string;
  body_pt: string;
  body_en: string;
  hero_image_url: string | null;
  hero_image_alt_pt: string | null;
  hero_image_alt_en: string | null;
  citations: Array<{ url: string; title?: string; publisher?: string; published_at?: string }>;
  video_url: string | null;
  video_aspect_ratio: string | null;
}

export interface Draft {
  id: string;
  created_at: string;
  updated_at: string;
  status: DraftStatus;
  manus_task_id: string | null;
  category: Category;
  title_pt: string;
  title_en: string;
  slug_pt: string;
  slug_en: string;
  excerpt_pt: string;
  excerpt_en: string;
  body_pt: string;
  body_en: string;
  hero_image_url: string | null;
  hero_image_alt_pt: string | null;
  hero_image_alt_en: string | null;
  citations: Array<{ url: string; title?: string; publisher?: string; published_at?: string }>;
  banned_word_hits: Record<string, number> | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  video_url: string | null;
  video_aspect_ratio: string | null;
}

export interface Subscriber {
  id: string;
  email: string;
  locale: Locale;
  status: SubscriberStatus;
  confirmation_token: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  last_email_sent_at: string | null;
  signup_ip: string | null;
  signup_user_agent: string | null;
  consent_text_version: string;
}
