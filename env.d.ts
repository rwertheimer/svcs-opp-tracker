/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_USE_MOCK_DATA?: string;
    readonly VITE_SAVED_VIEWS_API?: string;
  }
}

export {};
