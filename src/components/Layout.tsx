import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

const TABS = [
  { to: '/', icon: '🏰', label: 'Guilde', end: true },
  { to: '/boss', icon: '⚔️', label: 'Boss', end: false },
  { to: '/carte', icon: '🗺️', label: 'Carte', end: false },
  { to: '/perso', icon: '🧝', label: 'Perso', end: false },
  { to: '/reglages', icon: '⚙️', label: 'Réglages', end: false },
]

export function Layout({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="brand">{title}</h1>
          {subtitle && <div className="sub">{subtitle}</div>}
        </div>
        {action}
      </header>

      <main>{children}</main>

      <nav className="nav-bar" aria-label="Navigation principale">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <span className="icon" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
