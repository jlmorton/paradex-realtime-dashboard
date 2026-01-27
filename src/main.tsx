import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode disabled temporarily - it double-mounts components which breaks WebSocket
  <App />
);
