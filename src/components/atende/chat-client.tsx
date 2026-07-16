'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  sendTemplateReply,
  closeConversation,
  claimConversation,
  transferConversation,
  returnConversationToQueue,
  saveConversationContext,
} from '@/lib/actions/marketing/conversations';
import { avatarColor, initials, displayName, relTime, windowExpired } from './util';
import { AtendeComposer } from './atende-composer';

export type ChatMsg = {
  id: number;
  direction: string;
  body: string | null;
  createdAt: string | null;
  status: string | null;
  isTemplate: boolean;
  templateSid: string | null;
  hasAudio: boolean;
  hasMedia: boolean;
};

export type ChatContext = {
  opportunity: { id: number; municipio: string | null; stageLabel: string; owner: string | null } | null;
  campaignName: string | null;
  projectName: string | null;
};

export type ChatProps = {
  conversationId: number;
  contactName: string | null;
  waPhone: string;
  muni: string | null;
  uf: string | null;
  projectName: string | null;
  windowExpiresAt: string | null;
  assignedTo: string | null;
  ownerName: string | null;
  notes: string | null;
  tags: string[];
  meId: string;
  messages: ChatMsg[];
  context: ChatContext;
  agents: { id: string; name: string; role: string; open: number }[];
  templates: { contentSid: string; name: string }[];
  cannedResponses: { id: number; title: string; body: string }[];
  audioEnabled: boolean;
};

function Ticks({ status }: { status: string | null }) {
  if (!status) return null;
  if (status === 'failed' || status === 'undelivered') return <span className="rd fail">falhou</span>;
  if (status === 'read') return <span className="rd">✓✓</span>;
  if (status === 'delivered') return <span>✓✓</span>;
  return <span>✓</span>;
}

export function ChatClient(props: ChatProps) {
  const router = useRouter();
  const [sheet, setSheet] = useState<null | 'menu' | 'transfer' | 'ficha' | 'note' | 'template'>(null);
  const [noteDraft, setNoteDraft] = useState(props.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const threadRef = useRef<HTMLDivElement>(null);

  const expired = windowExpired(props.windowExpiresAt);
  const isMine = props.assignedTo === props.meId;
  const name = displayName(props.contactName, props.waPhone);
  const ownerLabel = props.assignedTo == null ? 'sem dono' : isMine ? 'você' : props.ownerName ?? 'outro';

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [props.messages.length]);

  function run(fn: () => Promise<{ ok: boolean; error?: string } | void>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (r && 'ok' in r && !r.ok) {
          setError(r.error ?? 'Falha na operação.');
          return;
        }
        onOk?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha na operação.');
      }
    });
  }

  function sendTemplate(contentSid: string) {
    const fd = new FormData();
    fd.set('conversationId', String(props.conversationId));
    fd.set('contentSid', contentSid);
    // Auto-preenche as 2 variáveis mais comuns (nome, município). Templates sem
    // variável ignoram; com mais, o atendente ajusta depois pelo inbox desktop.
    fd.set('var_1', props.contactName?.trim() || 'Secretário(a)');
    fd.set('var_2', props.muni?.trim() || 'seu município');
    run(() => sendTemplateReply(fd), () => setSheet(null));
  }

  function doClaim() {
    const fd = new FormData();
    fd.set('conversationId', String(props.conversationId));
    run(() => claimConversation(fd).then(() => ({ ok: true })));
  }

  function doTransfer(toUserId: string) {
    const fd = new FormData();
    fd.set('conversationId', String(props.conversationId));
    fd.set('toUserId', toUserId);
    run(() => transferConversation(fd), () => setSheet(null));
  }

  function doResolve() {
    const fd = new FormData();
    fd.set('conversationId', String(props.conversationId));
    run(() => closeConversation(fd).then(() => ({ ok: true })), () => setSheet(null));
  }

  function doReturn() {
    const fd = new FormData();
    fd.set('conversationId', String(props.conversationId));
    run(() => returnConversationToQueue(fd).then(() => ({ ok: true })), () => setSheet(null));
  }

  function saveNote() {
    const fd = new FormData();
    fd.set('conversationId', String(props.conversationId));
    fd.set('notes', noteDraft);
    run(() => saveConversationContext(fd).then(() => ({ ok: true })), () => setSheet(null));
  }

  const win = expired
    ? { cls: 'dead', label: '🔒 Fora da janela de 24h — só template aprovado reabre a conversa' }
    : { cls: 'ok', label: '🕑 Janela aberta — pode responder com mensagem livre' };

  // Separadores de dia pré-computados (sem mutação durante o render).
  const dayFor = (m: ChatMsg) => (m.createdAt ? new Date(m.createdAt).toLocaleDateString('pt-BR') : '');
  const showDayAt = props.messages.map((m, i) => {
    const day = dayFor(m);
    const prev = i > 0 ? dayFor(props.messages[i - 1]) : '';
    return !!day && day !== prev;
  });

  return (
    <div className="atd-app">
      <header className="atd-chathead">
        <a className="back" href="/atende" aria-label="Voltar">‹</a>
        <div className="cav" style={{ background: avatarColor(name) }}>
          {initials(props.contactName, props.waPhone)}
        </div>
        <div className="ci">
          <b>{name}</b>
          <span>
            {props.muni ? `${props.muni}${props.uf ? '/' + props.uf : ''} · ` : ''}
            dono: <b>{ownerLabel}</b>
          </span>
        </div>
        <button className="menu" onClick={() => setSheet('menu')} aria-label="Ações">⋮</button>
      </header>

      <div className={`atd-winbar ${win.cls === 'ok' ? '' : win.cls}`}>{win.label}</div>

      <div className="atd-thread" ref={threadRef}>
        {props.notes && (
          <div className="atd-msg sys" style={{ maxWidth: '92%', background: '#fff7d6', color: '#7a5c00', fontWeight: 500 }}>
            📌 {props.notes}
          </div>
        )}
        {props.messages.length === 0 && (
          <div className="atd-day">Sem mensagens ainda</div>
        )}
        {props.messages.map((m, i) => {
          const out = m.direction === 'outbound';
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {showDayAt[i] && <div className="atd-day">{sameDayLabel(dayFor(m))}</div>}
              <div className={`atd-msg ${out ? 'out' : 'in'} ${m.isTemplate ? 'tpl' : ''}`}>
                {m.isTemplate && <div className="tpllbl">Template Meta</div>}
                {m.hasAudio ? <span>🎧 Áudio</span> : m.hasMedia && !m.body ? <span>📎 Anexo</span> : m.body}
                <div className="t">
                  {relTime(m.createdAt)} {out && <Ticks status={m.status} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Banner assumir, quando sem dono */}
      {props.assignedTo == null && (
        <div style={{ flex: 'none', padding: '10px 12px', background: '#f4fbff', borderTop: '1px solid var(--line)' }}>
          <button className="atd-btn-primary" style={{ marginTop: 0 }} disabled={pending} onClick={doClaim}>
            {pending ? '…' : '✋ Assumir este atendimento'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ flex: 'none', padding: '6px 12px', background: '#fdeaea', color: '#c0392b', fontSize: 12, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Barra de ações */}
      <div className="atd-actrow">
        <button onClick={() => setSheet('transfer')}>🔄 Transferir</button>
        <button className="good" onClick={doResolve} disabled={pending}>✓ Resolver</button>
        <button onClick={() => setSheet('ficha')}>👤 Ficha</button>
        <button className="warn" onClick={() => setSheet('template')}>📄 Template</button>
        <button onClick={() => { setNoteDraft(props.notes ?? ''); setSheet('note'); }}>📝 Nota</button>
      </div>

      {/* Composer */}
      {expired ? (
        <div style={{ flex: 'none', padding: '12px', background: '#fff', borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, color: '#b5730d', background: '#fff6e8', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
            <b>Janela de 24h expirada.</b> Mensagem livre bloqueada pela Meta. Use um <b>template aprovado</b> para reabrir.
          </div>
          <button className="atd-btn-primary" style={{ marginTop: 0 }} onClick={() => setSheet('template')}>
            📄 Enviar template
          </button>
        </div>
      ) : (
        <AtendeComposer
          conversationId={props.conversationId}
          cannedResponses={props.cannedResponses}
          audioEnabled={props.audioEnabled}
        />
      )}

      {/* ═══ SHEETS ═══ */}
      {sheet === 'menu' && (
        <Sheet title="Ações da conversa" sub={`${name}${props.muni ? ' · ' + props.muni : ''}`} onClose={() => setSheet(null)}>
          <SheetItem icon="🔄" color="var(--navy)" title="Transferir para outro atendente" desc="Reatribui o dono" onClick={() => setSheet('transfer')} />
          <SheetItem icon="✓" color="#087a54" title="Marcar como resolvido" desc="status → closed" onClick={doResolve} />
          <SheetItem icon="📝" color="#b5730d" title="Nota interna" desc="Só o time vê" onClick={() => { setNoteDraft(props.notes ?? ''); setSheet('note'); }} />
          {props.assignedTo != null && (
            <SheetItem icon="↩︎" color="#c0392b" title="Devolver para a fila" desc="Remove o dono" onClick={doReturn} />
          )}
        </Sheet>
      )}

      {sheet === 'transfer' && (
        <Sheet title="Transferir atendimento" sub={`${name} → escolha o novo responsável`} onClose={() => setSheet(null)}>
          {error && <div className="err">{error}</div>}
          {props.agents.filter((a) => a.id !== props.meId).length === 0 && (
            <div className="atd-empty" style={{ padding: 20 }}>Nenhum outro atendente disponível.</div>
          )}
          {props.agents.filter((a) => a.id !== props.meId).map((a) => (
            <button key={a.id} className="atd-agentrow" disabled={pending} onClick={() => doTransfer(a.id)}>
              <div className="aav" style={{ background: avatarColor(a.name) }}>{initials(a.name)}</div>
              <div className="ai">
                <b>{a.name}</b>
                <span>{roleLabel(a.role)}</span>
              </div>
              <span className="ld">{a.open} {a.open === 1 ? 'aberta' : 'abertas'}</span>
            </button>
          ))}
        </Sheet>
      )}

      {sheet === 'template' && (
        <Sheet title="Enviar template aprovado" sub="Funciona dentro e fora da janela de 24h" onClose={() => setSheet(null)}>
          {error && <div className="err">{error}</div>}
          {props.templates.length === 0 ? (
            <div className="atd-empty" style={{ padding: 20 }}>
              <b>Nenhum template aprovado</b>
              Aprove um template WhatsApp na Meta para reabrir conversas.
            </div>
          ) : (
            props.templates.map((t) => (
              <button key={t.contentSid} className="atd-agentrow" disabled={pending} onClick={() => sendTemplate(t.contentSid)}>
                <div className="aav" style={{ background: 'var(--grad)' }}>📄</div>
                <div className="ai"><b>{t.name}</b><span>toque para enviar</span></div>
              </button>
            ))
          )}
        </Sheet>
      )}

      {sheet === 'ficha' && (
        <Sheet title="Ficha do cliente" sub={props.context.opportunity ? `Oportunidade #${props.context.opportunity.id}` : 'Contato do WhatsApp'} onClose={() => setSheet(null)} ficha>
          {props.context.opportunity && (
            <div className="stagebar">
              <small>Etapa no funil</small>
              <b>{props.context.opportunity.stageLabel}</b>
            </div>
          )}
          <div className="frow"><span>Contato</span><b>{props.contactName ?? '—'}</b></div>
          <div className="frow"><span>WhatsApp</span><b>{displayName(null, props.waPhone)}</b></div>
          <div className="frow"><span>Município</span><b>{props.muni ? `${props.muni}${props.uf ? '/' + props.uf : ''}` : '—'}</b></div>
          <div className="frow"><span>Projeto</span><b>{props.projectName ?? props.context.projectName ?? '—'}</b></div>
          {props.context.campaignName && <div className="frow"><span>Campanha</span><b>{props.context.campaignName}</b></div>}
          {props.context.opportunity?.owner && <div className="frow"><span>Dono no CRM</span><b>{props.context.opportunity.owner}</b></div>}
          {props.tags.length > 0 && <div className="frow"><span>Tags</span><b>{props.tags.join(' · ')}</b></div>}
        </Sheet>
      )}

      {sheet === 'note' && (
        <Sheet title="Nota interna" sub="Visível só para o time (não vai para o cliente)" onClose={() => setSheet(null)}>
          <textarea className="atd-note-ta" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Ex.: Prefeito é o decisor. Priorizar." />
          <button className="atd-btn-primary" disabled={pending} onClick={saveNote}>{pending ? 'Salvando…' : 'Salvar nota'}</button>
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ title, sub, onClose, children, ficha }: { title: string; sub: string; onClose: () => void; children: React.ReactNode; ficha?: boolean }) {
  return (
    <div className="atd-sheet show" onClick={onClose}>
      <div className={`card ${ficha ? 'atd-ficha' : ''}`} onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        <p className="sub">{sub}</p>
        {children}
        <button className="close" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

function SheetItem({ icon, color, title, desc, onClick }: { icon: string; color: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button className="atd-agentrow" onClick={onClick}>
      <div className="aav" style={{ background: color }}>{icon}</div>
      <div className="ai"><b>{title}</b><span>{desc}</span></div>
    </button>
  );
}

function roleLabel(role: string): string {
  if (role === 'admin') return 'Admin';
  if (role === 'gestor') return 'Gestor(a)';
  return 'Consultor(a)';
}

function sameDayLabel(day: string): string {
  const today = new Date().toLocaleDateString('pt-BR');
  const yest = new Date(Date.now() - 86400000).toLocaleDateString('pt-BR');
  if (day === today) return 'Hoje';
  if (day === yest) return 'Ontem';
  return day;
}
