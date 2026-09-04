import type { ReactNode } from 'react'

/** Panneau encadré, brique de base de toutes les vues. */
export function Panel({
  title,
  aside,
  children,
  tight,
}: {
  title?: string
  aside?: ReactNode
  children: ReactNode
  tight?: boolean
}) {
  return (
    <section className={tight ? 'panel tight' : 'panel'}>
      {(title || aside) && (
        <div className="panel-title">
          {title ? <h2>{title}</h2> : <span />}
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

/** Barre de progression étiquetée. */
export function StatBar({
  name,
  value,
  max,
  tone = 'xp',
  display,
}: {
  name: string
  value: number
  max: number
  tone?: 'hp' | 'xp' | 'march' | 'cardio' | 'gold'
  display?: string
}) {
  const safeMax = Math.max(1, max)
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100))

  return (
    <div className="stat-bar">
      <div className="labels">
        <span className="name">{name}</span>
        <span className="value">{display ?? `${formatNumber(value)} / ${formatNumber(max)}`}</span>
      </div>
      <div
        className="track"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={name}
      >
        <div className={`fill ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

/** Tuile de statistique compacte. */
export function StatTile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat-tile">
      <span className="value">{value}</span>
      <span className="label">{label}</span>
    </div>
  )
}

/** Message d'état (erreur, succès, info). */
export function Alert({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info' | 'warning'
  children: ReactNode
}) {
  return (
    <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

/** Sprite pixel art, jamais lissé. */
export function Sprite({
  src,
  alt,
  size = 92,
  className = '',
}: {
  src: string
  alt: string
  size?: number
  className?: string
}) {
  return (
    <img
      className={`sprite ${className}`}
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  )
}

/** Petit histogramme des derniers jours. */
export function Sparkline({
  values,
  goal,
  labels,
}: {
  values: number[]
  goal: number
  labels?: [string, string]
}) {
  const peak = Math.max(goal, ...values, 1)

  return (
    <>
      <div className="sparkline">
        {values.map((value, index) => (
          <div
            key={index}
            className={`bar ${value >= goal ? 'goal-met' : ''}`}
            style={{ height: `${Math.max(2, (value / peak) * 100)}%` }}
            title={`${formatNumber(value)}`}
          />
        ))}
      </div>
      {labels && (
        <div className="sparkline-axis">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </>
  )
}

/** Formatage des nombres à la française (espace insécable comme séparateur). */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('fr-FR')
}
