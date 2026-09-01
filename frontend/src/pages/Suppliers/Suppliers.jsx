import { useState, useEffect } from 'react';
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../../api/suppliers';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { useIosAlert, IconAlert } from '../../components/alerts';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import { IosField, IosInput } from '../../components/ui/IosForm';
import { IconPlus } from '../../components/ui/icons';

const Suppliers = () => {
  const { user } = useAuth();
  const { show: alert, confirm, toast } = useIosAlert();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    telefono: '',
    email: '',
    direccion: '',
  });

  const fetchSuppliers = async () => {
    setError('');
    try {
      const res = await getSuppliers();
      setSuppliers(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const resetForm = () => {
    setForm({ nombre: '', telefono: '', email: '', direccion: '' });
    setEditing(null);
    setShowForm(false);
  };

  if (user && user.rol !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-ios-surface rounded-full flex items-center justify-center mb-4 border border-ios-separator/40">
            <IconAlert className="w-7 h-7 text-ios-tertiary" strokeWidth={1.5} />
          </div>
          <p className="text-ios-tertiary text-sm">Solo el administrador puede gestionar proveedores</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editing) {
        await updateSupplier(editing._id, form);
      } else {
        await createSupplier(form);
      }
      resetForm();
      fetchSuppliers();
      toast({ message: 'Proveedor guardado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: err.response?.data?.message || 'Error al guardar proveedor' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (sup) => {
    setEditing(sup);
    setForm({
      nombre: sup.nombre,
      telefono: sup.telefono || '',
      email: sup.email || '',
      direccion: sup.direccion || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Eliminar este proveedor?',
      message: 'Esta acción no se puede deshacer',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteSupplier(id);
      fetchSuppliers();
      toast({ message: 'Proveedor eliminado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: err.response?.data?.message || 'Error al eliminar proveedor' });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-[28px] font-bold text-ios-label tracking-tight">Proveedores</h1>
        <IosButton
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex-1 sm:flex-none"
        >
          <IconPlus className="w-4 h-4" />
          Nuevo Proveedor
        </IosButton>
      </div>

      <IosModal
        open={showForm}
        onClose={resetForm}
        title={editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <IosField label="Nombre" required>
            <IosInput
              type="text"
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </IosField>
          <IosField label="Teléfono">
            <IosInput
              type="text"
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            />
          </IosField>
          <IosField label="Email">
            <IosInput
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </IosField>
          <IosField label="Dirección">
            <IosInput
              type="text"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            />
          </IosField>
          <div className="flex justify-end gap-3 pt-2">
            <IosButton type="button" variant="gray" onClick={resetForm}>
              Cancelar
            </IosButton>
            <IosButton type="submit" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Actualizar' : 'Crear'}</IosButton>
          </div>
        </form>
      </IosModal>

      {error && (
        <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="hidden md:block bg-ios-surface border border-ios-separator/30 rounded-3xl overflow-hidden shadow-ios-card">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-5 py-3 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Nombre</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Teléfono</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Email</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Dirección</th>
                <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-ios-tertiary text-sm">
                    No hay proveedores
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup._id} className="border-t border-ios-separator/30 hover:bg-ios-hover/[0.03] transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-ios-label">{sup.nombre}</td>
                    <td className="px-4 py-3.5 text-ios-secondary">{sup.telefono || '—'}</td>
                    <td className="px-4 py-3.5 text-ios-secondary">{sup.email || '—'}</td>
                    <td className="px-4 py-3.5 text-ios-secondary">{sup.direccion || '—'}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(sup)}
                          className="text-ios-tint hover:text-ios-tint/80 font-medium text-sm"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(sup._id)}
                          className="text-ios-red hover:text-ios-red/80 font-medium text-sm"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <div className="md:hidden space-y-2.5">
          {suppliers.length === 0 ? (
            <div className="text-center py-10 text-ios-tertiary text-sm">
              No hay proveedores
            </div>
          ) : (
            suppliers.map((sup) => (
              <div key={sup._id} className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-4 shadow-ios-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ios-label">{sup.nombre}</p>
                    <p className="text-xs text-ios-tertiary mt-0.5 truncate">{sup.email || '—'}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleEdit(sup)}
                      className="text-ios-tint text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(sup._id)}
                      className="text-ios-red text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-ios-separator/40 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ios-tertiary text-xs">Teléfono</span>
                    <span className="text-ios-secondary">{sup.telefono || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ios-tertiary text-xs">Dirección</span>
                    <span className="text-ios-secondary text-right">{sup.direccion || '—'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Suppliers;