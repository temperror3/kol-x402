import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CampaignProvider } from './contexts/CampaignContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import AccountsList from './pages/AccountsList';
import AccountDetail from './pages/AccountDetail';
import Analytics from './pages/Analytics';
import Outreach from './pages/Outreach';

export default function App() {
  return (
    <BrowserRouter>
      <CampaignProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="accounts" element={<AccountsList />} />
            <Route path="accounts/:id" element={<AccountDetail />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="outreach" element={<Outreach />} />
          </Route>
        </Routes>
      </CampaignProvider>
    </BrowserRouter>
  );
}
