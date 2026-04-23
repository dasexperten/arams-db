'use client'

import { useEffect, useState, useCallback } from 'react'
import { Nav } from '../components/ds/Nav'
import { Tile, HaloColor } from '../components/ds/Tile'
import { Button } from '../components/ds/Button'
import { Footer } from '../components/ds/Footer'

const OWNER = 'dasexperten'
const REPO  = 'arams-db'
const STATUS_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/docs/wb-fbo-status.json`
const RUNS_URL   = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/wb-fbo-monthly.yml/runs?per_page=8`
const ACTIONS_URL = `https://github.com/${OWNER}/${REPO}/actions/workflows/wb-fbo-monthly.yml`

interface ClusterStat { to_ship: number; sku_count: number; oos: number; deficit: number }
interface StatusData {
  run_date: string
  generated_at: string
  stocks_rows: number
  sales_rows: number
  total_skus: number
  to_ship_count: number
  to_ship_units: number
  oos_count: number
  overstock_count: number
  exit_code: number
  clusters: Record<string, ClusterStat>
}
interface WorkflowRun {
  run_number: number
  created_at: string
  updated_at: string
  conclusion: string | null
  status: string
  html_url: string
}

const CLUSTER_HALOS: Record<string, HaloColor> = {
  'Центральный':   'violet',
  'Восточный':     'cyan',
  'Волга':         'amber',
  'Северо-западный': 'rose',
  'Южный':         'magenta',
}

function fmt(n: number | undefined) {
  return (n ?? 0).toLocaleString('ru-RU')
}

function RunBadge({ conclusion, status }: { conclusion: string | null; status: string }) {
  if (status === 'in_progress' || status === 'queued')
    return <span style={badge('#F5A524', '#1A0F00')}>В процессе</span>
  if (conclusion === 'success')  return <span style={badge('#78E825', '#0A1500')}>Успех</span>
  if (conclusion === 'failure')  return <span style={badge('#FB4C5C', '#1A0509')}>Ошибка</span>
  if (conclusion === 'cancelled') return <span style={badge('#3A3A3A', '#E5E5E5')}>Отменён</span>
  return <span style={badge('#3A3A3A', '#E5E5E5')}>{conclusion || status || '?'}</span>
}
function badge(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }
}

function MetricCard({ value, label, accent, danger }: { value: string | number; label: string; accent?: boolean; danger?: boolean }) {
  const color = danger ? '#FB4C5C' : accent ? '#78E825' : '#fff'
  return (
    <div style={{
      background: '#141414', border: '1px solid #242424', borderRadius: 10,
      padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 40, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em', color }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#8A8A8A', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '56px 0 24px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.018em', color: '#fff' }}>
        {children}
      </h2>
    </div>
  )
}

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [statusErr, setStatusErr] = useState('')
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [runsErr, setRunsErr] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setStatusErr('')
    setRunsErr('')

    fetch(STATUS_URL + '?t=' + Date.now())
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setStatus)
      .catch(e => setStatusErr(e.message))
      .finally(() => setLoading(false))

    fetch(RUNS_URL, { headers: { Accept: 'application/vnd.github+json' } })
      .then(r => r.json())
      .then(d => setRuns(d.workflow_runs || []))
      .catch(e => setRunsErr(e.message))
  }, [])

  useEffect(() => { load() }, [load])

  const clusters = status?.clusters ?? {}
  const clusterKeys = Object.keys(clusters)
    .filter(k => k !== 'UNKNOWN')
    .sort((a, b) => (clusters[b].to_ship ?? 0) - (clusters[a].to_ship ?? 0))

  return (
    <div style={{ background: '#000', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, Helvetica Neue, Arial, sans-serif' }}>
      <Nav brand="das experten" />

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px 80px' }}>

        {/* ── Hero ── */}
        <div style={{ padding: '64px 0 40px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#8A8A8A', marginBottom: 16 }}>
            Wildberries FBO · Das Experten
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(40px, 4.4vw, 72px)', fontWeight: 300, lineHeight: 1.02, letterSpacing: '-0.018em' }}>
            Пульт управления поставками
          </h1>
          {status?.run_date && (
            <p style={{ margin: '16px 0 0', color: '#8A8A8A', fontSize: 15 }}>
              Расчёт от {status.run_date} · {status.stocks_rows.toLocaleString('ru')} позиций остатков · {status.sales_rows.toLocaleString('ru')} продаж
            </p>
          )}
        </div>

        {/* ── OOS warning ── */}
        {status && status.oos_count > 0 && (
          <div style={{
            background: 'rgba(251,76,92,0.12)', border: '1px solid rgba(251,76,92,0.4)',
            borderRadius: 10, padding: '14px 20px', marginBottom: 24,
            color: '#FB4C5C', fontWeight: 600, fontSize: 15,
          }}>
            {status.oos_count} позиций в out-of-stock — требуют приоритетной отгрузки
          </div>
        )}

        {/* ── Metrics ── */}
        {loading && !status && (
          <div style={{ color: '#8A8A8A', padding: '40px 0', fontSize: 15 }}>Загружаем данные...</div>
        )}
        {statusErr && (
          <div style={{ color: '#FB4C5C', padding: '20px 0', fontSize: 15 }}>
            {statusErr.includes('404') ? '⚠ Расчёт ещё не выполнялся — запустите workflow.' : `Ошибка: ${statusErr}`}
          </div>
        )}
        {status && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <MetricCard value={fmt(status.to_ship_units)} label="Штук к поставке" accent />
            <MetricCard value={status.to_ship_count} label="SKU × кластеров" />
            <MetricCard value={status.oos_count} label="Out of stock" danger={status.oos_count > 0} />
            <MetricCard value={status.overstock_count} label="Overstock" />
          </div>
        )}

        {/* ── Cluster tiles ── */}
        {clusterKeys.length > 0 && (
          <>
            <SectionTitle>По кластерам</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${clusterKeys.length}, 1fr)`, gap: 12 }}>
              {clusterKeys.map(cl => {
                const c = clusters[cl]
                return (
                  <Tile
                    key={cl}
                    label={cl}
                    halo={CLUSTER_HALOS[cl] ?? 'cyan'}
                    media={
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 48, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.04em', color: '#fff' }}>
                          {fmt(c.to_ship)}
                        </div>
                        <div style={{ fontSize: 12, color: '#B8B8B8', marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          шт.
                        </div>
                        <div style={{ marginTop: 12, fontSize: 12, color: '#8A8A8A' }}>
                          {c.sku_count} SKU
                          {c.oos > 0 && <span style={{ color: '#FB4C5C', marginLeft: 6 }}>· {c.oos} OOS</span>}
                        </div>
                      </div>
                    }
                  />
                )
              })}
            </div>
          </>
        )}

        {/* ── Actions ── */}
        <SectionTitle>Действия</SectionTitle>
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 10, padding: '28px 24px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="primary" size="lg" onClick={() => window.open(ACTIONS_URL, '_blank')}>
              Запустить расчёт в GitHub Actions →
            </Button>
            <Button variant="ghost" size="lg" onClick={load}>
              Обновить данные
            </Button>
          </div>
          <p style={{ margin: '16px 0 0', fontSize: 13, color: '#8A8A8A' }}>
            Нажми «Run workflow» в GitHub Actions. Excel-файл придёт в Telegram после завершения.
          </p>
        </div>

        {/* ── Run history ── */}
        <SectionTitle>История прогонов</SectionTitle>
        {runsErr && <div style={{ color: '#FB4C5C', fontSize: 14 }}>Ошибка: {runsErr}</div>}
        {runs.length > 0 && (
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#1C1C1C' }}>
                  {['#', 'Дата запуска', 'Статус', 'Длительность', 'Лог'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', color: '#8A8A8A', fontWeight: 600, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #242424' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => {
                  const created = run.created_at ? new Date(run.created_at) : null
                  const updated = run.updated_at ? new Date(run.updated_at) : null
                  const dur = created && updated
                    ? Math.max(0, Math.round((updated.getTime() - created.getTime()) / 60000)) + ' мин'
                    : '—'
                  return (
                    <tr key={run.run_number} style={{ borderBottom: i < runs.length - 1 ? '1px solid #242424' : 'none' }}>
                      <td style={{ padding: '12px 16px', color: '#8A8A8A' }}>#{run.run_number}</td>
                      <td style={{ padding: '12px 16px', color: '#E5E5E5' }}>{created?.toLocaleString('ru-RU') ?? '—'}</td>
                      <td style={{ padding: '12px 16px' }}><RunBadge conclusion={run.conclusion} status={run.status} /></td>
                      <td style={{ padding: '12px 16px', color: '#8A8A8A' }}>{dur}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <a href={run.html_url} target="_blank" rel="noreferrer" style={{ color: '#78E825', textDecoration: 'none', fontWeight: 500 }}>
                          → Лог
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Footer
        brand="das experten"
        tagline="Wildberries FBO · Автоматический расчёт поставок"
        legalLinks={[{ label: 'GitHub', href: `https://github.com/${OWNER}/${REPO}` }]}
      />
    </div>
  )
}
