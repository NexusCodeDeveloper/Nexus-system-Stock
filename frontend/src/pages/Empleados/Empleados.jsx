import { useState, useEffect, useRef } from 'react';
import {
  obtenerUsuarios,
  crearUsuario,
  actualizarUsuario,
  reiniciarClave,
  cambiarActivo,
  eliminarUsuario,
} from '../../api/usuarios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAutenticacion } from '../../context/AutenticacionContext';
import { useIosAlert, IconAlert } from '../../components/alerts';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosSegmented from '../../components/ui/IosSegmented';
import { IosField, IosInput } from '../../components/ui/IosForm';
import { IconPlus } from '../../components/ui/icons';

const formularioVacio = () => ({
  nombre: '',
  email: '',
  clave: '',
  rol: 'user',
});

const Empleados = () => {
  const { usuario, esAdmin } = useAutenticacion();
  const { show: alerta, confirm: confirmar, toast } = useIosAlert();
  const [empleados, setEmpleados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const seqRef = useRef(0);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(formularioVacio());
  const [reiniciando, setReiniciando] = useState(null);
  const [claveNueva, setClaveNueva] = useState('');
  const [guardandoClave, setGuardandoClave] = useState(false);

  const cargarEmpleados = async () => {
    const seq = ++seqRef.current;
    setError('');
    try {
      const res = await obtenerUsuarios();
      if (seq !== seqRef.current) return;
      setEmpleados(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(obtenerMensajeErrorApi(err, 'Error al cargar empleados'));
    } finally {
      if (seq === seqRef.current) setCargando(false);
    }
  };

  useEffect(() => {
    if (esAdmin) cargarEmpleados();
    else setCargando(false);
  }, [esAdmin]);

  const resetForm = () => {
    setForm(formularioVacio());
    setEditando(null);
    setMostrarForm(false);
  };

  if (usuario && !esAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-ios-surface rounded-full flex items-center justify-center mb-4 border border-ios-separator/40">
            <IconAlert className="w-7 h-7 text-ios-tertiary" strokeWidth={1.5} />
          </div>
          <p className="text-ios-tertiary text-sm">Solo el administrador puede gestionar empleados</p>
        </div>
      </div>
    );
  }

  const esMismo = (emp) => String(emp._id) === String(usuario?._id);

  const handleEditar = (emp) => {
    setEditando(emp);
    setForm({
      nombre: emp.nombre,
      email: emp.email,
      clave: '',
      rol: emp.rol,
    });
    setMostrarForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    try {
      if (editando) {
        await actualizarUsuario(editando._id, {
          nombre: form.nombre,
          email: form.email,
          rol: form.rol,
        });
        toast({ message: 'Empleado actualizado' });
      } else {
        await crearUsuario({
          nombre: form.nombre,
          email: form.email,
          clave: form.clave,
          rol: form.rol,
          activo: true,
        });
        toast({ message: 'Empleado creado' });
      }
      resetForm();
      cargarEmpleados();
    } catch (err) {
      alerta({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al guardar empleado') });
    } finally {
      setGuardando(false);
    }
  };

  const handleReiniciar = (emp) => {
    setReiniciando(emp);
    setClaveNueva('');
  };

  const handleGuardarClave = async (e) => {
    e.preventDefault();
    if (guardandoClave) return;
    setGuardandoClave(true);
    try {
      await reiniciarClave(reiniciando._id, claveNueva);
      setReiniciando(null);
      setClaveNueva('');
      toast({ message: 'Contraseña actualizada' });
    } catch (err) {
      alerta({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al actualizar la contraseña') });
    } finally {
      setGuardandoClave(false);
    }
  };

  const handleCambiarActivo = async (emp) => {
    const confirmado = await confirmar({
      icon: 'warning',
      title: emp.activo ? '¿Desactivar este empleado?' : '¿Activar este empleado?',
      message: emp.activo
        ? 'No va a poder iniciar sesión hasta que lo actives de nuevo'
        : 'Va a poder iniciar sesión nuevamente',
      confirmText: emp.activo ? 'Desactivar' : 'Activar',
      destructive: emp.activo,
    });
    if (!confirmado) return;
    try {
      await cambiarActivo(emp._id, !emp.activo);
      cargarEmpleados();
      toast({ message: emp.activo ? 'Empleado desactivado' : 'Empleado activado' });
    } catch (err) {
      alerta({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al cambiar el estado') });
    }
  };

  const handleEliminar = async (emp) => {
    const confirmado = await confirmar({
      icon: 'warning',
      title: '¿Eliminar este empleado?',
      message: 'Esta acción no se puede deshacer',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmado) return;
    try {
      await eliminarUsuario(emp._id);
      cargarEmpleados();
      toast({ message: 'Empleado eliminado' });
    } catch (err) {
      alerta({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar empleado') });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-[28px] font-bold text-ios-label tracking-tight">Empleados</h1>
        <IosButton
          onClick={() => {
            resetForm();
            setMostrarForm(true);
          }}
          className="flex-1 sm:flex-none"
        >
          <IconPlus className="w-4 h-4" />
          Nuevo Empleado
        </IosButton>
      </div>

      <IosModal
        open={mostrarForm}
        onClose={resetForm}
        title={editando ? 'Editar Empleado' : 'Nuevo Empleado'}
        maxWidth="max-w-lg"
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
          <IosField label="Email" required>
            <IosInput
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </IosField>
          {!editando && (
            <IosField label="Contraseña" required hint="Mínimo 6 caracteres">
              <IosInput
                type="password"
                required
                minLength={6}
                value={form.clave}
                onChange={(e) => setForm({ ...form, clave: e.target.value })}
              />
            </IosField>
          )}

          <IosField label="Rol">
            <IosSegmented
              options={[
                { value: 'user', label: 'Empleado' },
                { value: 'admin', label: 'Administrador' },
              ]}
              value={form.rol}
              onChange={(rol) => setForm({ ...form, rol })}
            />
          </IosField>

          <div className="flex justify-end gap-3 pt-2">
            <IosButton type="button" variant="gray" onClick={resetForm}>
              Cancelar
            </IosButton>
            <IosButton type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : editando ? 'Actualizar' : 'Crear'}
            </IosButton>
          </div>
        </form>
      </IosModal>

      <IosModal
        open={Boolean(reiniciando)}
        onClose={() => setReiniciando(null)}
        title="Reiniciar contraseña"
        maxWidth="max-w-sm"
      >
        <form onSubmit={handleGuardarClave} className="space-y-4">
          <p className="text-sm text-ios-secondary">
            Nueva contraseña para <span className="font-semibold text-ios-label">{reiniciando?.nombre}</span>
          </p>
          <IosField label="Contraseña" required hint="Mínimo 6 caracteres">
            <IosInput
              type="password"
              required
              minLength={6}
              value={claveNueva}
              onChange={(e) => setClaveNueva(e.target.value)}
            />
          </IosField>
          <div className="flex justify-end gap-3 pt-2">
            <IosButton type="button" variant="gray" onClick={() => setReiniciando(null)}>
              Cancelar
            </IosButton>
            <IosButton type="submit" disabled={guardandoClave}>
              {guardandoClave ? 'Guardando…' : 'Actualizar'}
            </IosButton>
          </div>
        </form>
      </IosModal>

      {error && (
        <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
          {error}
        </div>
      )}

      {cargando ? (
        <LoadingSpinner />
      ) : (
        <div className="hidden md:block bg-ios-surface border border-ios-separator/30 rounded-3xl overflow-hidden shadow-ios-card">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-5 py-3 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Nombre</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Email</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Rol</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Estado</th>
                <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empleados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-ios-tertiary text-sm">
                    No hay empleados
                  </td>
                </tr>
              ) : (
                empleados.map((emp) => (
                  <tr key={emp._id} className="border-t border-ios-separator/30 hover:bg-ios-hover/[0.03] transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-ios-label">
                      {emp.nombre}
                      {esMismo(emp) && <span className="ml-2 text-[11px] text-ios-tertiary font-medium">(vos)</span>}
                    </td>
                    <td className="px-4 py-3.5 text-ios-secondary">{emp.email}</td>
                    <td className="px-4 py-3.5 text-ios-secondary">
                      {emp.rol === 'admin' ? (
                        <span className="inline-flex items-center gap-2">
                          Administrador
                          <span className="text-[11px] px-2 py-0.5 rounded-ios-pill bg-ios-tint/10 text-ios-tint font-semibold">
                            Protegido
                          </span>
                        </span>
                      ) : (
                        'Empleado'
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-ios-pill text-xs font-semibold ${
                          emp.activo ? 'bg-ios-green/15 text-ios-green' : 'bg-ios-surface3 text-ios-tertiary'
                        }`}
                      >
                        {emp.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-3 flex-wrap">
                        {emp.rol === 'admin' ? (
                          <>
                            {esMismo(emp) && (
                              <button
                                onClick={() => handleReiniciar(emp)}
                                className="text-ios-secondary hover:text-ios-label font-medium text-sm"
                              >
                                Reiniciar clave
                              </button>
                            )}
                            <span className="text-ios-tertiary text-xs font-semibold self-center">Protegido</span>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEditar(emp)}
                              className="text-ios-tint hover:text-ios-tint/80 font-medium text-sm"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleReiniciar(emp)}
                              className="text-ios-secondary hover:text-ios-label font-medium text-sm"
                            >
                              Reiniciar clave
                            </button>
                            <button
                              onClick={() => handleCambiarActivo(emp)}
                              className="text-ios-secondary hover:text-ios-label font-medium text-sm"
                            >
                              {emp.activo ? 'Desactivar' : 'Activar'}
                            </button>
                            <button
                              onClick={() => handleEliminar(emp)}
                              className="text-ios-red hover:text-ios-red/80 font-medium text-sm"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && (
        <div className="md:hidden space-y-2.5">
          {empleados.length === 0 ? (
            <div className="text-center py-10 text-ios-tertiary text-sm">No hay empleados</div>
          ) : (
            empleados.map((emp) => (
              <div key={emp._id} className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-4 shadow-ios-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ios-label">
                      {emp.nombre}
                      {esMismo(emp) && <span className="ml-2 text-[11px] text-ios-tertiary font-medium">(vos)</span>}
                    </p>
                    <p className="text-xs text-ios-tertiary mt-0.5 truncate">{emp.email}</p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-ios-pill text-xs font-semibold ${
                      emp.activo ? 'bg-ios-green/15 text-ios-green' : 'bg-ios-surface3 text-ios-tertiary'
                    }`}
                  >
                    {emp.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="mt-3 pt-3 border-t border-ios-separator/40 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ios-tertiary text-xs">Rol</span>
                    {emp.rol === 'admin' ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-ios-secondary">Administrador</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-ios-pill bg-ios-tint/10 text-ios-tint font-semibold">
                          Protegido
                        </span>
                      </span>
                    ) : (
                      <span className="text-ios-secondary">Empleado</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-ios-separator/40 flex flex-wrap gap-2">
                  {emp.rol === 'admin' ? (
                    <>
                      {esMismo(emp) && (
                        <button
                          onClick={() => handleReiniciar(emp)}
                          className="text-ios-secondary text-xs border border-ios-separator/50 px-2.5 py-1 rounded-ios-pill hover:bg-ios-hover/[0.05] transition-all font-semibold"
                        >
                          Reiniciar clave
                        </button>
                      )}
                      <span className="text-ios-tertiary text-xs font-semibold self-center">Protegido</span>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEditar(emp)}
                        className="text-ios-tint text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleReiniciar(emp)}
                        className="text-ios-secondary text-xs border border-ios-separator/50 px-2.5 py-1 rounded-ios-pill hover:bg-ios-hover/[0.05] transition-all font-semibold"
                      >
                        Reiniciar clave
                      </button>
                      <button
                        onClick={() => handleCambiarActivo(emp)}
                        className="text-ios-secondary text-xs border border-ios-separator/50 px-2.5 py-1 rounded-ios-pill hover:bg-ios-hover/[0.05] transition-all font-semibold"
                      >
                        {emp.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => handleEliminar(emp)}
                        className="text-ios-red text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold"
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Empleados;
