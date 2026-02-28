/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_CIRCLE_APP_ID?: string;
  readonly VITE_CIRCLE_ENVIRONMENT?: string;
  readonly VITE_CIRCLE_BASE_URL?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
