import { Route, Routes } from 'react-router-dom';
import { Footer, Nav } from './components/Layout';
import Home from './pages/Home';
import Engine from './pages/Engine';

export default function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/engine" element={<Engine />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Footer />
    </div>
  );
}
