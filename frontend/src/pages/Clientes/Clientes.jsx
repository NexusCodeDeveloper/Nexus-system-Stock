import { useState, useEffect } from 'react';
import {
  obtenerClientes,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
} from '../../api/clientes';
import {
  obtenerSolicitudesCliente,
  crearSolicitudCliente,
  aprobarSolicitudCliente,
  rechazarSolicitudCliente,
} from '../../api/solicitudesCliente';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAutenticacion } from '../../context/autenticacionContexto';
import { useSolicitudesCliente } from '../../context/solicitudContexto';
import { useIosAlert, IconAlert } from '../../components/alerts';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import { useApi } from '../../hooks/useApi';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosSearch from '../../components/ui/IosSearch';
import { IosField, IosInput } from '../../components/ui/IosForm';
import { IconPlus, IconPencil, IconTrash, IconChevronRight, IconUsers } from '../../components/ui/icons';
import { formatMoney, formatDate } from '../../utils/format';
import {
  hayErrores,
  LIMITES,
  validarEmail,
  validarTelefono,
  validarTexto,
} from '../../utils/validacion';
import ClienteDetalle from './ClienteDetalle';

const formularioVacio = () => ({ nombre: '', documento: '', telefono: '', email: '', direccion: '' });

const estadoSolicitudCls = {
  pendiente: 'bg-amber-500/15 text-amber-400',
  aprobada: 'bg-green-500/15 text-green-400',
  rechazada: 'bg-red-500/15 text-red-400',
};

const saldoInfo = (saldo) => {
  const n = Number(saldo) || 0;
  if (n > 0) return { label: `Debe ${formatMoney(n)}`, cls: 'text-ios-red bg-ios-red/10' };
  if (n < 0) return { label: `A favor ${formatMoney(Math.abs(n))}`, cls: 'text-ios-green bg-ios-green/10' };
  return { label: 'Libre de deuda', cls: 'text-ios-green bg-ios-green/10' };
};

const Clientes = () => {
  const { esAdmin } = useAutenticacion();
  const { refresh: refrescarPendientes } = useSolicitudesCliente();
  const { show: alert, confirm, toast } = useIosAlert();
  const [buscar, setBuscar] = useState('');
  const [buscarDebounced, setBuscarDebounced] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(formularioVacio());
  const [errores, setErrores] = useState({});
  const [saving, setSaving] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [rechazando, setRechazando] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState('');
  const [rechazandoSaving, setRechazandoSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setBuscarDebounced(buscar.trim()), 300);
    return () => clearTimeout(timer);
  }, [buscar]);

  const clientesApi = useApi(
    async () => {
      const res = await obtenerClientes({ buscar: buscarDebounced || undefined, limit: 200 });
      return Array.isArray(res.data) ? res.data : [];
    },
    { auto: false, mensajeError: 'Error al cargar clientes' }
  );
  const { run: cargarClientes, loading, error } = clientesApi;
  const clientes = clientesApi.data || [];

  const solicitudesApi = useApi(
    async () => {
      const res = await obtenerSolicitudesCliente({ limit: 200 });
      return Array.isArray(res.data) ? res.data : [];
    },
    { auto: false, mensajeError: 'Error al cargar solicitudes' }
  );
  const { run: cargarSolicitudes } = solicitudesApi;
  const solicitudes = solicitudesApi.data || [];
  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente');

  useEffect(() => {
    cargarClientes();
    cargarSolicitudes();
  }, [cargarClientes, cargarSolicitudes, buscarDebounced]);

  const resetForm = () => {
    setForm(formularioVacio());
    setErrores({});
    setEditando(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const errs = {
      nombre: validarTexto(form.nombre, LIMITES.nombre, 'El nombre'),
      documento: validarTexto(form.documento, LIMITES.documento, 'El documento'),
      telefono: validarTelefono(form.telefono),
      email: validarEmail(form.email),
      direccion: validarTexto(form.direccion, LIMITES.direccion, 'La dirección'),
    };
    setErrores(errs);
    if (hayErrores(errs)) return;
    const nombre = form.nombre.trim();
    if (editando) {
      const ok = await confirm({
        icon: 'warning',
        title: '¿Guardar cambios?',
        message: `Se van a sobrescribir los datos guardados de "${editando.nombre}".`,
        confirmText: 'Guardar',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const datos = {
        nombre,
        documento: form.documento.trim(),
        telefono: form.telefono.trim(),
        email: form.email.trim(),
        direccion: form.direccion.trim(),
      };
      if (esAdmin) {
        if (editando) {
          await actualizarCliente(editando._id, datos);
          toast({ message: 'Cliente actualizado' });
        } else {
          await crearCliente(datos);
          toast({ message: 'Cliente creado' });
        }
        cargarClientes();
      } else {
        await crearSolicitudCliente(datos);
        toast({ message: 'Solicitud enviada al administrador' });
        cargarSolicitudes();
      }
      resetForm();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al guardar cliente') });
    } finally {
      setSaving(false);
    }
  };

  const handleEditar = (cliente) => {
    setEditando(cliente);
    setForm({
      nombre: cliente.nombre || '',
      documento: cliente.documento || '',
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      direccion: cliente.direccion || '',
    });
    setShowForm(true);
  };

  const handleEliminar = async (cliente) => {
    const ok = await confirm({
      icon: 'warning',
      title: `¿Eliminar a ${cliente.nombre}?`,
      message: 'Solo se puede eliminar si no tiene movimientos en su cuenta corriente.',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await eliminarCliente(cliente._id);
      toast({ message: 'Cliente eliminado' });
      cargarClientes();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar cliente') });
    }
  };

  const handleAprobar = async (solicitud) => {
    const ok = await confirm({
      icon: 'question',
      title: `¿Aprobar a ${solicitud.datos?.nombre}?`,
      message: 'Se crea el cliente para poder cargarle movimientos en su cuenta corriente.',
      confirmText: 'Aprobar',
    });
    if (!ok) return;
    try {
      await aprobarSolicitudCliente(solicitud._id);
      toast({ message: 'Solicitud aprobada' });
      cargarClientes();
      cargarSolicitudes();
      refrescarPendientes();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al aprobar la solicitud') });
    }
  };

  const handleRechazar = async () => {
    if (rechazandoSaving) return;
    const motivo = motivoRechazo.trim();
    const err = validarTexto(motivo, LIMITES.motivo, 'El motivo');
    if (err) {
      setErrorMotivo(err);
      return;
    }
    setErrorMotivo('');
    setRechazandoSaving(true);
    try {
      await rechazarSolicitudCliente(rechazando._id, motivo);
      setRechazando(null);
      setMotivoRechazo('');
      setErrorMotivo('');
      toast({ message: 'Solicitud rechazada' });
      cargarSolicitudes();
      refrescarPendientes();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al rechazar la solicitud') });
    } finally {
      setRechazandoSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-ios-label tracking-tight">Clientes</h1>
          <p className="text-[13px] text-ios-tertiary mt-0.5">Cuentas corrientes y saldos</p>
        </div>
        <IosButton
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <IconPlus className="w-4 h-4" /> {esAdmin ? 'Nuevo cliente' : 'Solicitar alta'}
        </IosButton>
      </div>

      <IosSearch value={buscar} onChange={setBuscar} placeholder="Buscar por nombre o documento" className="mb-4" />

      {esAdmin && pendientes.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 overflow-hidden">
          <p className="px-4 pt-3 pb-1 text-[12px] font-bold text-amber-300 uppercase tracking-wider">
            Solicitudes pendientes ({pendientes.length})
          </p>
          {pendientes.map((solicitud) => (
            <div key={solicitud._id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-amber-500/15">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ios-label truncate">{solicitud.datos?.nombre}</p>
                <p className="text-[11px] text-ios-tertiary">
                  {solicitud.datos?.documento ? `Doc. ${solicitud.datos.documento} · ` : ''}
                  Pidió {solicitud.solicitanteNombre || 'un empleado'} · {formatDate(solicitud.fechaCreacion)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <IosButton size="xs" onClick={() => handleAprobar(solicitud)}>Aprobar</IosButton>
                <IosButton
                  size="xs"
                  variant="destructiveTinted"
                  onClick={() => {
                    setRechazando(solicitud);
                    setMotivoRechazo('');
                  }}
                >
                  Rechazar
                </IosButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {!esAdmin && solicitudes.length > 0 && (
        <div className="mb-5 rounded-2xl border border-ios-separator/40 bg-ios-surface/70 overflow-hidden">
          <p className="px-4 pt-3 pb-1 text-[12px] font-bold text-ios-tertiary uppercase tracking-wider">Mis solicitudes</p>
          {solicitudes.map((solicitud) => (
            <div key={solicitud._id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-ios-separator/30">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ios-label truncate">{solicitud.datos?.nombre}</p>
                <p className="text-[11px] text-ios-tertiary">
                  {formatDate(solicitud.fechaCreacion)}
                  {solicitud.estado === 'rechazada' && solicitud.motivo ? ` · ${solicitud.motivo}` : ''}
                </p>
              </div>
              <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-ios-pill capitalize ${estadoSolicitudCls[solicitud.estado] || ''}`}>
                {solicitud.estado}
              </span>
            </div>
          ))}
        </div>
      )}

      {loading && clientes.length === 0 && (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="h-8 w-8" />
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <IconAlert className="w-7 h-7 mx-auto text-ios-tertiary mb-2" strokeWidth={1.5} />
            <p className="text-sm text-ios-tertiary">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && clientes.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto bg-ios-surface rounded-full flex items-center justify-center mb-4 border border-ios-separator/40">
              <IconUsers className="w-7 h-7 text-ios-tertiary" strokeWidth={1.5} />
            </div>
            <p className="text-ios-tertiary text-sm">
              {buscarDebounced ? 'No hay clientes con esa búsqueda' : 'Todavía no hay clientes cargados'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {clientes.map((cliente) => {
          const info = saldoInfo(cliente.saldo);
          return (
            <div
              key={cliente._id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-ios-separator/30 bg-ios-surface px-4 py-3 hover:bg-ios-hover/[0.04] transition-colors"
            >
              <button
                type="button"
                onClick={() => setDetalle(cliente)}
                className="flex w-full sm:w-auto sm:flex-1 items-center gap-3 min-w-0 text-left"
              >
                <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-ios-tint/30 to-blue-600/30 flex items-center justify-center text-ios-tint font-bold text-sm">
                  {String(cliente.nombre || '?').trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ios-label truncate">{cliente.nombre}</p>
                  <p className="text-[11px] text-ios-tertiary truncate">
                    {[cliente.documento && `Doc. ${cliente.documento}`, cliente.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                  </p>
                </div>
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2 ml-auto sm:ml-0">
                {Number(cliente.cuotasVencidas) > 0 && (
                  <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-ios-pill tabular-nums text-ios-red bg-ios-red/10">
                    {cliente.cuotasVencidas} cuota{Number(cliente.cuotasVencidas) === 1 ? '' : 's'} vencida{Number(cliente.cuotasVencidas) === 1 ? '' : 's'}
                  </span>
                )}
                <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-ios-pill tabular-nums ${info.cls}`}>
                  {info.label}
                </span>
                {esAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleEditar(cliente)}
                      className="p-1.5 btn-icono btn-icono-azul"
                      aria-label="Editar cliente"
                    >
                      <IconPencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEliminar(cliente)}
                      className="p-1.5 btn-icono btn-icono-rojo"
                      aria-label="Eliminar cliente"
                    >
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <IconChevronRight className="hidden sm:block w-4 h-4 text-ios-tertiary shrink-0" />
              </div>
            </div>
          );
        })}
      </div>

      <IosModal
        open={showForm}
        onClose={resetForm}
        title={editando ? 'Editar cliente' : esAdmin ? 'Nuevo cliente' : 'Solicitar alta de cliente'}
        confirmText={saving ? 'Guardando…' : esAdmin ? 'Guardar' : 'Enviar solicitud'}
        onConfirm={handleSubmit}
        confirmDisabled={saving}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <IosField label="Nombre" required error={errores.nombre}>
            <IosInput
              value={form.nombre}
              maxLength={LIMITES.nombre.max}
              invalid={Boolean(errores.nombre)}
              onChange={(e) => {
                setErrores((prev) => ({ ...prev, nombre: '' }));
                setForm((f) => ({ ...f, nombre: e.target.value }));
              }}
              placeholder="Nombre y apellido o razón social"
              autoFocus
            />
          </IosField>
          <div className="grid grid-cols-2 gap-3">
            <IosField label="Documento" error={errores.documento}>
              <IosInput
                value={form.documento}
                maxLength={LIMITES.documento.max}
                invalid={Boolean(errores.documento)}
                onChange={(e) => {
                  setErrores((prev) => ({ ...prev, documento: '' }));
                  setForm((f) => ({ ...f, documento: e.target.value }));
                }}
                placeholder="DNI / CUIT"
              />
            </IosField>
            <IosField label="Teléfono" error={errores.telefono}>
              <IosInput
                type="tel"
                value={form.telefono}
                maxLength={LIMITES.telefono.max}
                invalid={Boolean(errores.telefono)}
                onChange={(e) => {
                  setErrores((prev) => ({ ...prev, telefono: '' }));
                  setForm((f) => ({ ...f, telefono: e.target.value }));
                }}
                placeholder="Opcional"
              />
            </IosField>
          </div>
          <IosField label="Email" error={errores.email}>
            <IosInput
              type="email"
              value={form.email}
              maxLength={LIMITES.email.max}
              invalid={Boolean(errores.email)}
              onChange={(e) => {
                setErrores((prev) => ({ ...prev, email: '' }));
                setForm((f) => ({ ...f, email: e.target.value }));
              }}
              placeholder="Opcional"
            />
          </IosField>
          <IosField label="Dirección" error={errores.direccion}>
            <IosInput
              value={form.direccion}
              maxLength={LIMITES.direccion.max}
              invalid={Boolean(errores.direccion)}
              onChange={(e) => {
                setErrores((prev) => ({ ...prev, direccion: '' }));
                setForm((f) => ({ ...f, direccion: e.target.value }));
              }}
              placeholder="Opcional"
            />
          </IosField>
          {!esAdmin && (
            <p className="text-[12px] text-ios-tertiary leading-relaxed">
              El alta la revisa un administrador. Cuando la apruebe vas a poder cargarle movimientos.
            </p>
          )}
        </form>
      </IosModal>

      <IosModal
        open={Boolean(rechazando)}
        onClose={() => {
          setRechazando(null);
          setMotivoRechazo('');
          setErrorMotivo('');
        }}
        title="Rechazar solicitud"
        confirmText={rechazandoSaving ? 'Rechazando…' : 'Rechazar'}
        confirmVariant="destructive"
        onConfirm={handleRechazar}
        confirmDisabled={rechazandoSaving}
      >
        <p className="text-sm text-ios-secondary mb-3">
          Se rechaza el alta de <span className="font-semibold text-ios-label">{rechazando?.datos?.nombre}</span>. El empleado va a ver el motivo.
        </p>
        <IosField label="Motivo" required error={errorMotivo}>
          <IosInput
            value={motivoRechazo}
            maxLength={LIMITES.motivo.max}
            invalid={Boolean(errorMotivo)}
            onChange={(e) => {
              setErrorMotivo('');
              setMotivoRechazo(e.target.value);
            }}
            placeholder="Ej: falta el documento"
            autoFocus
          />
        </IosField>
      </IosModal>

      <ClienteDetalle
        cliente={detalle}
        open={Boolean(detalle)}
        onClose={() => setDetalle(null)}
        onCambio={cargarClientes}
      />
    </div>
  );
};

export default Clientes;
