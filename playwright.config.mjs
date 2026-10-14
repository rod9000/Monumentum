/* Testes de ponta a ponta (navegador de verdade). Usa o Microsoft Edge já instalado
   no Windows (channel 'msedge'), então não precisa baixar navegador.
   Uso:  npm run test:e2e */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  projects: [
    {
      name: 'celular',
      use: {
        channel: 'msedge',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1
      }
    },
    {
      name: 'desktop',
      use: {
        channel: 'msedge',
        viewport: { width: 1280, height: 720 }
      }
    }
  ]
});
