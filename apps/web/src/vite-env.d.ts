/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LESSON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
