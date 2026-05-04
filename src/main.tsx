import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Allow static-host 404 fallback to redirect via /#/path and restore real pathname client-side.
if (window.location.hash.startsWith('#/')) {
	window.history.replaceState(null, '', window.location.hash.slice(1));
}

createRoot(document.getElementById("root")!).render(<App />);
