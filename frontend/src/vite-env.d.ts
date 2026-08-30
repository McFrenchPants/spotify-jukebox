/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Dev-only convenience default for NativeBackendGate's setup screen, so
   * the backend URL doesn't need retyping on every reinstall during native
   * build iteration. Set via frontend/.env.local (gitignored, machine-
   * specific) — never set in a real build/release.
   */
  readonly VITE_DEFAULT_BACKEND_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
