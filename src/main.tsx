import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// 새로고침·뒤로가기 때 브라우저가 이전 스크롤 위치를 복원하지 않도록 (탭 이동은 앱이 맨 위로 맞춤)
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
