/**
 * Language switcher widget.
 */

import { SUPPORTED_LANGS, getLang, setLang, onLangChange, type SupportedLang } from '@i18n'

const SWITCHER_ID = 'lang-switcher'
let   _mounted    = false

function renderSwitcher(container: HTMLElement): void {
  const current = getLang()
  container.innerHTML = SUPPORTED_LANGS.map(lang => `
    <button
      class="lang-btn ${lang.code === current ? 'lang-btn--active' : ''}"
      data-lang="${lang.code}"
      title="${lang.label}"
      aria-label="${lang.label}"
    >${lang.flag}</button>
  `).join('')

  container.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset['lang'] as SupportedLang
      void setLang(code)
    })
  })
}

export function mountLangSwitcher(): void {
  let container = document.getElementById(SWITCHER_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = SWITCHER_ID
    document.body.appendChild(container)
  }

  renderSwitcher(container)

  if (!_mounted) {
    _mounted = true
    onLangChange(() => {
      const el = document.getElementById(SWITCHER_ID)
      if (el) renderSwitcher(el)
      void import('./router').then(({ renderApp }) => renderApp())
    })
  }
}
