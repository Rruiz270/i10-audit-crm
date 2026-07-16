'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AtendeInbox, AtendeItem } from '@/lib/actions/marketing/conversations';
import { avatarColor, initials, displayName, relTime, windowState } from './util';

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
  const { me, mine, queue } = data;

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

      <nav className="atd-botnav">
        <a className="on" onClick={(e) => { e.preventDefault(); setTab('mine'); }} href="#">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          Conversas
        </a>
        <a onClick={(e) => { e.preventDefault(); setTab('queue'); }} href="#">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20v-6M6 20V10M18 20V4" /></svg>
          Minha fila
        </a>
        <Link href="/me">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
          Perfil
        </Link>
      </nav>
    </div>
  );
}
