import { Route, Routes } from 'react-router-dom';
import { Footer, Nav } from './components/Layout';
import Home from './pages/Home';
import Engine from './pages/Engine';
import Audit from './pages/Audit';

export default function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/engine" element={<Engine />} />
        <Route path="/a/:id" element={<Audit />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Footer />
    </div>
  );
}
