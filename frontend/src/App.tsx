import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AccountsList from './pages/AccountsList';
import AccountDetail from './pages/AccountDetail';
import Analytics from './pages/Analytics';
import Outreach from './pages/Outreach';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="accounts" element={<AccountsList />} />
          <Route path="accounts/:id" element={<AccountDetail />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="outreach" element={<Outreach />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
