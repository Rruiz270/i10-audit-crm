import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupervisorData } from '@/lib/actions/marketing/conversations';
import { avatarColor, initials, displayName, relTime, windowState } from '@/components/atende/util';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'i10 · Console de Atendimento' };

function roleLabel(role: string): string {
  if (role === 'admin') return 'Admin';
  if (role === 'gestor') return 'Gestor(a)';
  return 'Consultor(a)';
}

export default async function SupervisorPage() {
  let data;
  try {
    data = await getSupervisorData();
  } catch {
    redirect('/atende'); // não é supervisor
  }
  const { kpis, agents, rows } = data;

  return (
    <div className="atd-console">
      <div className="wrap">
        <div className="atd-topbar">
          <div className="brand">
            <div className="atd-badge"><i /><i /><i /></div>
            <div>
              <h1>Console de Atendimento</h1>
              <p>Visão ao vivo de todas as conversas do time · WhatsApp i10</p>
            </div>
          </div>
          <Link className="goapp" href="/atende">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>
            Abrir meu app
          </Link>
        </div>

        <div className="atd-kpis">
          <div className="atd-kpi"><div className="k">Conversas abertas</div><div className="v">{kpis.open}</div></div>
          <div className={`atd-kpi ${kpis.queue > 0 ? 'alert' : ''}`}><div className="k">Sem dono (fila)</div><div className="v">{kpis.queue}</div></div>
          <div className={`atd-kpi ${kpis.outsideWindow > 0 ? 'alert' : ''}`}><div className="k">Fora da janela 24h</div><div className="v">{kpis.outsideWindow}</div></div>
          <div className="atd-kpi"><div className="k">Resolvidas hoje</div><div className="v">{kpis.resolvedToday}</div></div>
        </div>

        <div className="atd-cgrid">
          <div className="atd-panel">
            <div className="ph">
              <h3>Todas as conversas</h3>
              <span className="atd-live"><i />AO VIVO</span>
            </div>
            <div className="atd-tablewrap">
              {rows.length === 0 ? (
                <div className="atd-console-empty">
                  Nenhuma conversa ainda. Quando um contato responder no WhatsApp, ela aparece aqui.
                </div>
              ) : (
                <table className="atd-table">
                  <thead>
                    <tr><th>Cliente</th><th>Projeto</th><th>Atendente</th><th>Status</th><th>Janela</th><th>Últ. msg</th><th></th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const name = displayName(r.contactName, '');
                      const win = windowState(r.windowExpiresAt);
                      const stCls = r.status === 'closed' ? 'closed' : r.status === 'pending' ? 'pending' : 'open';
                      const stLabel = r.status === 'closed' ? 'Resolvida' : r.ownerId == null ? 'Na fila' : r.status === 'pending' ? 'Aguardando' : 'Aberta';
                      return (
                        <tr key={r.id}>
                          <td>
                            <div className="atd-cli">
                              <div className="mini" style={{ background: avatarColor(r.contactName ?? String(r.id)) }}>{initials(r.contactName, String(r.id))}</div>
                              <div>
                                <b>{name || 'Contato'}</b>
                                {r.muni && <span>{r.muni}{r.uf ? '/' + r.uf : ''}</span>}
                              </div>
                            </div>
                          </td>
                          <td>{r.projectName ?? '—'}</td>
                          <td>
                            {r.ownerId ? (
                              <div className="atd-owner">
                                <div className="od" style={{ background: avatarColor(r.ownerName ?? r.ownerId) }}>{initials(r.ownerName ?? '?')}</div>
                                {r.ownerName ?? '—'}
                              </div>
                            ) : (
                              <div className="atd-owner none"><b>— sem dono —</b></div>
                            )}
                          </td>
                          <td><span className={`atd-st ${stCls}`}>{stLabel}</span></td>
                          <td>{r.status === 'closed' ? '—' : <span className={`atd-chip win ${win.cls === 'ok' ? '' : win.cls}`}>{win.label.replace('🕑 janela ', '').replace('🔒 ', '')}</span>}</td>
                          <td>{relTime(r.lastMessageAt)}</td>
                          <td><Link className="atd-st open" style={{ textDecoration: 'none' }} href={`/atende/c/${r.id}`}>Abrir</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="atd-agside">
            <div className="atd-panel" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800 }}>Time</h3>
                <span className="atd-live" style={{ marginLeft: 'auto' }}><i />{agents.length} no time</span>
              </div>
            </div>
            {agents.length === 0 && <div className="atd-panel atd-console-empty">Nenhum atendente cadastrado.</div>}
            {agents.map((a) => (
              <div className="atd-acard" key={a.id}>
                <div className="top">
                  <div className="aa" style={{ background: avatarColor(a.name) }}>{initials(a.name)}</div>
                  <div className="an"><b>{a.name}</b><span>{roleLabel(a.role)}</span></div>
                  <div className="stat"><b>{a.open}</b><span>{a.open === 1 ? 'aberta' : 'abertas'}</span></div>
                </div>
                <div className="bars">
                  <div className={`bar ${a.unread > 0 ? 'warn' : ''}`}><div className="n">{a.unread}</div><div className="l">sem responder</div></div>
                  <div className="bar"><div className="n">{a.open}</div><div className="l">em atendimento</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
