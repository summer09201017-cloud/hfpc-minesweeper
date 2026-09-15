import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/xp.css';
import { registerPwa } from './pwa';
import { useGame } from './store';
import { applyTheme } from './theme';

// ★ 在 render 之前就把主題寫上去 —— 晚一步的話,使用者選了深色皮卻會先看到一閃的淺色。
const s = useGame.getState();
applyTheme(s.theme, s.backdrop);

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
registerPwa();
