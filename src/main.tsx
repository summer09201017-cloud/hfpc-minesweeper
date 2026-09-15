import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/xp.css';
import { registerPwa } from './pwa';

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
registerPwa();
