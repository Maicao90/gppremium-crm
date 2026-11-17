// LAB (22/10): monta so a pagina "Cerebro do robo" pra testar o Aprendizado da Josy contra o servidor de laboratorio.
// Nao faz parte do painel publicado.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { CerebroRobo } from '../src/pages/CerebroRobo';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div style={{ padding: 'clamp(12px, 2.5vw, 28px)', maxWidth: 1100, margin: '0 auto', minHeight: '100vh', background: 'var(--bg-color)' }}>
      <CerebroRobo />
    </div>
  </StrictMode>,
);
