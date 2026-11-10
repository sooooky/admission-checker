import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 배포 빌드에만 콘텐츠 보안 정책(CSP)을 넣습니다.
// connect-src 'none' 이므로 이 앱은 어떤 서버로도 데이터를 전송할 수 없습니다.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    );
  },
});

export default defineConfig({
  base: '/admission-checker/',
  plugins: [react(), tailwindcss(), cspPlugin()],
  build: { chunkSizeWarningLimit: 1500 },
});
