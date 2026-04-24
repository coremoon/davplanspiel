/**
 * Hash-based router.
 */

import { t } from '@i18n'
import type { TabId } from './state'
import { store, setTab } from './state'
import { getSession, clearSession } from '@auth/session'

export function navigate(tab: TabId): void {
  setTab(tab)
  renderApp()
}

const pages: Record<TabId, () => Promise<{ render: (root: HTMLElement) => void }>> = {
  'login':           () => import('./pages/login'),
  'home':            () => import('./pages/home'),
  'analyse-gruppe':  () => import('./pages/analyse_gruppe'),
  'analyse-markt':   () => import('./pages/analyse_markt'),
  'overview':        () => import('./pages/overview'),
  'sieger':          () => import('./pages/sieger'),
}

export async function renderApp(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) return

  const state   = store.get()
  const session = getSession()

  if (!session || session.login_as === '') {
    const { render } = await pages['login']()
    render(root)
    return
  }

  root.innerHTML = getShellHTML(state.activeTab, session.login_as, session.gruppe)
  attachSidebarListeners()

  const content = document.getElementById('page-content')
  if (!content) return

  const pageKey = state.activeTab in pages ? state.activeTab : 'home'
  const { render } = await pages[pageKey as TabId]()
  render(content)

  renderNotification()
}

function getShellHTML(active: TabId, loginAs: string, gruppe: string): string {
  const state = store.get()
  const cfg   = state.cfg

  const tabs: Array<{ id: TabId; label: string; icon: string; show: boolean }> = [
    { id: 'home',           label: t('nav.home'),           icon: '🏠', show: true },
    { id: 'analyse-gruppe', label: t('nav.analyse_group'),  icon: '📈', show: loginAs !== '' },
    { id: 'analyse-markt',  label: t('nav.analyse_market'), icon: '🌍', show: loginAs !== '' },
    { id: 'overview',       label: t('nav.overview'),       icon: '🔍', show: loginAs === 'admin' },
    { id: 'sieger',         label: t('nav.ranking'),        icon: '🏆',
      show: state.runTimes > (cfg?.anzahl_durchlauefe ?? 999) && state.runTimes > 0 },
  ]

  const navItems = tabs
    .filter(tab => tab.show)
    .map(tab => `
      <button class="nav-btn ${tab.id === active ? 'active' : ''}" data-tab="${tab.id}">
        ${tab.icon} ${tab.label}
      </button>
    `).join('')

  const userLabel = loginAs === 'admin'
    ? '👤 Admin'
    : loginAs === 'groupadmin'
      ? `👤 ${gruppe}`
      : `👁️ ${gruppe}`

  return `
    <div class="shell">
      <nav class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-title">📊 Planspiel</div>
          <div class="sidebar-user">${userLabel}</div>
        </div>
        <div class="sidebar-nav">${navItems}</div>
        <div class="sidebar-footer">
          <button class="nav-btn logout-btn" id="btn-logout">🚪 ${t('nav.logout')}</button>
        </div>
      </nav>
      <main class="content">
        <div id="notification-area"></div>
        <div id="page-content"></div>
      </main>
    </div>
  `
}

function attachSidebarListeners(): void {
  document.querySelectorAll<HTMLButtonElement>('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset['tab'] as TabId
      if (tab) navigate(tab)
    })
  })

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    clearSession()
    store.set({ session: null, activeTab: 'login' })
    renderApp()
  })
}

function renderNotification(): void {
  const area = document.getElementById('notification-area')
  if (!area) return
  store.subscribe(state => {
    if (!state.notification) { area.innerHTML = ''; return }
    const { type, text } = state.notification
    area.innerHTML = `<div class="alert alert-${type}">${text}</div>`
  })
}
