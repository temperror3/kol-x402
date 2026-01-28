import { useEffect, useState } from 'react';
import {
  getConfigurations,
  createConfiguration,
  updateConfiguration,
  deleteConfiguration,
  setDefaultConfiguration,
  triggerSearch,
} from '../api/client';
import type {
  ConfigurationWithStats,
  SearchConfiguration,
  CreateConfigurationInput,
} from '../types';
import ConfigurationForm from '../components/ConfigurationForm';

export default function Configurations() {
  const [list, setList] = useState<ConfigurationWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SearchConfiguration | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTriggered, setSearchTriggered] = useState<string | null>(null);

  const fetchList = async () => {
    try {
      setLoading(true);
      const res = await getConfigurations();
      setList(res.data);
      setError(null);
    } catch (err) {
      setError('Failed to load configurations');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const handleEdit = (config: SearchConfiguration) => {
    setEditing(config);
    setModalOpen(true);
  };

  const handleSubmit = async (data: CreateConfigurationInput) => {
    if (editing) {
      await updateConfiguration(editing.id, data);
    } else {
      await createConfiguration(data);
    }
    setModalOpen(false);
    setEditing(null);
    await fetchList();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete configuration "${name}"? Accounts linked to it will be unlinked.`)) {
      return;
    }
    try {
      setActionLoading(id);
      await deleteConfiguration(id);
      await fetchList();
    } catch (err) {
      console.error(err);
      alert('Failed to delete. It may be the default config.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      setActionLoading(id);
      await setDefaultConfiguration(id);
      await fetchList();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunSearch = async (id: string) => {
    try {
      setActionLoading(id);
      await triggerSearch(id, 5);
      setSearchTriggered(id);
      setTimeout(() => setSearchTriggered(null), 3000);
    } catch (err) {
      console.error(err);
      alert('Failed to start search. Check API and Redis.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Search configurations</h1>
          <p className="text-slate-500 mt-1">
            Define topics and keywords. Each configuration is used to discover and categorize KOLs for that topic.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          New configuration
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-slate-500">
          Loading configurations…
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-slate-600 mb-4">No configurations yet.</p>
          <p className="text-slate-500 text-sm mb-6">
            Create one to define a topic (keywords + context) and run searches to find KOLs.
          </p>
          <button
            type="button"
            onClick={handleCreate}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700"
          >
            Create configuration
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Keywords
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Accounts
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Default
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-4">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    {c.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{c.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    <span className="line-clamp-2">
                      {[...(c.primary_keywords || []), ...(c.secondary_keywords || [])].slice(0, 4).join(', ')}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm">
                    <span className="text-slate-700">{c.account_count ?? 0}</span>
                    {typeof c.kol_count === 'number' && (
                      <span className="text-slate-500 ml-1">({c.kol_count} KOL)</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {c.is_default ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        Default
                      </span>
                    ) : (
                      <span className="text-slate-400 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleRunSearch(c.id)}
                      disabled={actionLoading === c.id}
                      className="text-emerald-600 hover:text-emerald-800 text-sm font-medium disabled:opacity-50"
                    >
                      {searchTriggered === c.id ? 'Queued' : 'Run search'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(c)}
                      className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                    {!c.is_default && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSetDefault(c.id)}
                          disabled={actionLoading === c.id}
                          className="text-slate-600 hover:text-slate-800 text-sm font-medium disabled:opacity-50"
                        >
                          Set default
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id, c.name)}
                          disabled={actionLoading === c.id}
                          className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">
                {editing ? 'Edit configuration' : 'New configuration'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Keywords and topic context are used for search and AI categorization.
              </p>
            </div>
            <div className="p-6">
              <ConfigurationForm
                initial={editing}
                onSubmit={handleSubmit}
                onCancel={() => {
                  setModalOpen(false);
                  setEditing(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/50"
          aria-label="Close modal"
          onClick={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
