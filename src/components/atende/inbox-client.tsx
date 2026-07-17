'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AtendeInbox, AtendeItem } from '@/lib/actions/marketing/conversations';
import { createContactFromAtende } from '@/lib/actions/marketing/inbox-contacts';
import { avatarColor, initials, displayName, relTime, windowState } from './util';
import { PushControls } from './push-controls';

function ConvRow({ item }: { item: AtendeItem }) {
  const name = displayName(item.contactName, item.waPhone);
  const win = windowState(item.windowExpiresAt);
  const sub = item.muni ? `${item.muni}${item.uf ? '/' + item.uf : ''}` : item.projectName ?? 'Sem projeto';
  const preview = item.preview
    ? (item.previewOutbound ? 'Você: ' : '') + item.preview
    : 'Sem mensagens ainda';
  return (
    <Link href={`/atende/c/${item.id}`} className="atd-conv">
      <div className="atd-cav" style={{ background: avatarColor(name) }}>
        {initials(item.contactName, item.waPhone)}
      </div>
      <div className="mid">
        <div className="r1">
          <span className="nm">{name}</span>
          <span className="tm">{relTime(item.lastMessageAt)}</span>
        </div>
        <div className="muni">{sub}</div>
        <div className="prev">{preview}</div>
        <div className="r3">
          <span className={`atd-chip win ${win.cls === 'ok' ? '' : win.cls}`}>{win.label}</span>
          {item.projectName && <span className="atd-chip proj">{item.projectName}</span>}
          {item.assignedTo == null && <span className="atd-chip new">novo</span>}
        </div>
      </div>
      {item.unread && <span className="unreadN" />}
    </Link>
  );
}

export function InboxClient({ data }: { data: AtendeInbox }) {
  const [tab, setTab] = useState<'mine' | 'queue'>(data.mine.length === 0 && data.queue.length > 0 ? 'queue' : 'mine');
  const [modal, setModal] = useState<null | 'new' | 'profile'>(null);
  const [ncErr, setNcErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const router = useRouter();
  const { me, mine, queue } = data;

  // Cria contato SEM zerar o formulário em erro: valida no servidor e mostra
  // erro inline; só navega para o chat quando dá certo.
  function handleNewContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setNcErr(null);
    startSave(async () => {
      try {
        const r = await createContactFromAtende(fd);
        if (!r.ok) {
          setNcErr(r.error);
          return;
        }
        setModal(null);
        router.push(`/atende/c/${r.conversationId}`);
      } catch {
        setNcErr('Falha ao salvar. Tente novamente.');
      }
    });
  }

  return (
    <div className="atd-app">
      <header className="atd-head">
        <div className="av" style={{ background: 'rgba(255,255,255,.16)' }}>
          {initials(me.name, me.id)}
        </div>
        <div className="who">
          <b>{me.name ?? 'Atendente'}</b>
          <span>{me.isSupervisor ? 'Supervisor' : 'Consultor'}{data.projectName ? ` · ${data.projectName}` : ''}</span>
        </div>
        <div className="ic">
          {me.isSupervisor && (
            <Link href="/atende/supervisor" title="Console do supervisor">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
              Console
            </Link>
          )}
        </div>
      </header>

      <PushControls />

      <div className="atd-seg">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
          Meus atendimentos <span className="pill">{mine.length}</span>
        </button>
        <button className={`q ${tab === 'queue' ? 'on' : ''}`} onClick={() => setTab('queue')}>
          Fila · sem dono <span className="pill">{queue.length}</span>
        </button>
      </div>

      {tab === 'mine' ? (
        <div className="atd-list">
          {mine.length === 0 ? (
            <div className="atd-empty">
              <b>Nenhum atendimento seu agora</b>
              Pegue um lead na aba <b style={{ display: 'inline', color: '#b5730d' }}>Fila · sem dono</b>.
            </div>
          ) : (
            mine.map((c) => <ConvRow key={c.id} item={c} />)
          )}
        </div>
      ) : (
        <div className="atd-list">
          {queue.length === 0 ? (
            <div className="atd-empty">
              <b>Fila vazia 🎉</b>
              Nenhum lead sem dono no momento.
            </div>
          ) : (
            <>
              <div className="atd-queue-cta">
                {queue.length} {queue.length === 1 ? 'lead chegou' : 'leads chegaram'} e ainda {queue.length === 1 ? 'está' : 'estão'} sem dono. Abra para atender 👇
              </div>
              {queue.map((c) => <ConvRow key={c.id} item={c} />)}
            </>
          )}
        </div>
      )}

      {/* FAB: novo contato */}
      <button className="atd-fab" onClick={() => setModal('new')} aria-label="Novo contato">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
      </button>

      <nav className="atd-botnav">
        <a className={tab === 'mine' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab('mine'); }} href="#">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          Conversas
        </a>
        <a className={tab === 'queue' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab('queue'); }} href="#">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20v-6M6 20V10M18 20V4" /></svg>
          Minha fila
        </a>
        <a onClick={(e) => { e.preventDefault(); setModal('profile'); }} href="#">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
          Perfil
        </a>
      </nav>

      {/* Sheet: novo contato → cria na base e abre a conversa */}
      {modal === 'new' && (
        <div className="atd-sheet show" onClick={() => setModal(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h4>Novo contato</h4>
            <p className="sub">Salva na base (alimenta o CRM) e já abre a conversa</p>
            {ncErr && <div className="err">{ncErr}</div>}
            <form onSubmit={handleNewContact}>
              <label className="atd-field">
                <span>Nome</span>
                <input name="name" required placeholder="Ex.: João Carlos (Prefeito)" autoComplete="off" />
              </label>
              <label className="atd-field">
                <span>WhatsApp (com DDD)</span>
                <input name="phone" required inputMode="tel" placeholder="15 99999-9999" autoComplete="off" />
              </label>
              <div className="atd-field-row">
                <label className="atd-field" style={{ flex: 3 }}>
                  <span>Município</span>
                  <input name="municipio" placeholder="Ex.: Sorocaba" autoComplete="off" />
                </label>
                <label className="atd-field" style={{ flex: 1 }}>
                  <span>UF</span>
                  <input name="uf" placeholder="SP" maxLength={2} autoComplete="off" style={{ textTransform: 'uppercase' }} />
                </label>
              </div>
              <label className="atd-field">
                <span>Cargo</span>
                <input name="cargo" placeholder="Ex.: Secretário(a) de Educação" autoComplete="off" />
              </label>
              <label className="atd-field">
                <span>De onde veio o lead</span>
                <select name="origem" defaultValue="">
                  <option value="">Selecione…</option>
                  <option>Evento / estande</option>
                  <option>Conexão APM</option>
                  <option>Indicação</option>
                  <option>Ligação ativa</option>
                  <option>WhatsApp / inbound</option>
                  <option>Campanha</option>
                  <option>Outro</option>
                </select>
              </label>
              <label className="atd-field">
                <span>E-mail <em>(opcional)</em></span>
                <input name="email" type="email" placeholder="contato@municipio.sp.gov.br" autoComplete="off" />
              </label>
              <button type="submit" className="atd-btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar e abrir conversa'}
              </button>
            </form>
            <button className="close" onClick={() => setModal(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Sheet: perfil */}
      {modal === 'profile' && (
        <div className="atd-sheet show" onClick={() => setModal(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h4>Meu perfil</h4>
            <p className="sub">Sessão do app de atendimento</p>
            <div className="atd-profile">
              <div className="pav" style={{ background: avatarColor(me.name ?? me.id) }}>{initials(me.name, me.id)}</div>
              <div>
                <b>{me.name ?? 'Atendente'}</b>
                <span>{me.isSupervisor ? 'Supervisor (vê tudo)' : 'Consultor'}{data.projectName ? ` · ${data.projectName}` : ''}</span>
              </div>
            </div>
            {me.isSupervisor && (
              <Link href="/atende/supervisor" className="atd-profile-link">📊 Console do supervisor</Link>
            )}
            <div className="atd-install">
              <b>📲 Instalar como app no celular</b>
              <span><b>iPhone:</b> botão Compartilhar → “Adicionar à Tela de Início”.<br /><b>Android:</b> menu ⋮ → “Adicionar à tela inicial”.</span>
            </div>
            <Link href="/api/auth/signout" prefetch={false} className="atd-signout">Sair da conta</Link>
            <button className="close" onClick={() => setModal(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
