import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Board } from './components/Board.js';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Board now={new Date()} />
  </StrictMode>,
);
