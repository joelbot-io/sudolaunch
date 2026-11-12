import type { SudoLaunchApi } from '../../shared/preloadApi'

declare global {
  interface Window {
    api: SudoLaunchApi
  }
}

export {}
