import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../style.css';
import '../portal.css';
import './react-portal.css';

createRoot(document.getElementById('root')).render(<App />);
