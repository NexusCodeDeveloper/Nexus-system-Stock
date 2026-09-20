import { useState, useEffect, useRef } from 'react';
import {
  obtenerNotificaciones,
  crearNotificacion,
  actualizarNotificacion,
  eliminarNotificacion,
  completarNotificacion,
  reabrirNotificacion,
} from '../../api/notificaciones';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import { IosField, IosInput, IosTextArea } from '../../components/ui/IosForm';
import { useAutenticacion } from '../../context/AutenticacionContext';
import { useNotificaciones } from '../../context/NotificacionContext';
import { useIosAlert } from '../../components/alerts';
import { IconBell, IconPlus, IconPencil, IconTrash, IconCheck, IconRefresh, IconChevronRight } from '../../components/ui/icons';
import { formatDate } from '../../utils/format';

const EstadoBadge = ({ estado }) =>
  estado === 'realizado' ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-ios-pill bg-ios-green/15 text-ios-green text-[11px] font-semibold shrink-0">
      <IconCheck className="w-3 h-3" strokeWidth={2.5} />
      Realizado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-ios-pill bg-ios-orange/15 text-ios-orange text-[11px] font-semibold shrink-0">
      Pendiente
    </span>
  );

const Notificaciones = () => {
  const { usuario } = useAutenticacion();
  const { refresh, marcarVistasAdmin } = useNotificaciones();
  const { confirm, toast, show: alert } = useIosAlert();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seqRef = useRef(0);

  const [detail, setDetail] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ titulo: '', descripcion: '' });

  const [completeTarget, setCompleteTarget] = useState(null);
  const [comment, setComment] = useState('');
  const [savingComplete, setSavingComplete] = useState(false);

  const isAdmin = usuario?.rol === 'admin';

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    if (isAdmin) marcarVistasAdmin();
  }, [isAdmin, marcarVistasAdmin]);

  const fetchNotifications = async () => {
    const seq = ++seqRef.current;
    setError('');
    try {
      const res = await obtenerNotificaciones();
      if (seq !== seqRef.current) return;
      setNotifications(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(obtenerMensajeErrorApi(err, 'Error al cargar avisos'));
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ titulo: '', descripcion: '' });
    setFormOpen(true);
  };

  const openEdit = (n) => {
    setEditing(n);
    setForm({ titulo: n.titulo, descripcion: n.descripcion });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.titulo.trim() || !form.descripcion.trim()) {
      alert({ icon: 'warning', title: 'Campos requeridos', message: 'Debe completar título y descripción' });
      return;
    }
    if (savingNotif) return;
    setSavingNotif(true);
    try {
      if (editing) {
        await actualizarNotificacion(editing._id, form);
        toast({ message: 'Aviso actualizado' });
      } else {
        await crearNotificacion(form);
        toast({ message: 'Aviso creado' });
      }
      setFormOpen(false);
      fetchNotifications();
      refresh();
    } catch (err) {
      alert({
        icon: 'error',
        title: 'Error',
        message: obtenerMensajeErrorApi(err, 'Error al guardar el aviso'),
      });
    } finally {
      setSavingNotif(false);
    }
  };

  const handleDelete = async (n) => {
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Eliminar este aviso?',
      message: 'Se eliminará para todos los empleados',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return false;
    try {
      await eliminarNotificacion(n._id);
      fetchNotifications();
      refresh();
      toast({ message: 'Aviso eliminado' });
      return true;
    } catch (err) {
      alert({
        icon: 'error',
        title: 'Error',
        message: obtenerMensajeErrorApi(err, 'Error al eliminar el aviso'),
      });
      return false;
    }
  };

  const handleComplete = async () => {
    if (!completeTarget || savingComplete) return;
    setSavingComplete(true);
    try {
      await completarNotificacion(completeTarget._id, {
        comentario: comment.trim(),
      });
      toast({ message: 'Aviso marcado como realizado' });
      setCompleteTarget(null);
      setComment('');
      fetchNotifications();
      refresh();
    } catch (err) {
      alert({
        icon: 'error',
        title: 'Error',
        message: obtenerMensajeErrorApi(err, 'Error al marcar el aviso'),
      });
    } finally {
      setSavingComplete(false);
    }
  };

  const handleReopen = async (n) => {
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Reabrir este aviso?',
      message: 'Volverá a estado pendiente y se borrará el comentario',
      confirmText: 'Reabrir',
    });
    if (!confirmed) return false;
    try {
      await reabrirNotificacion(n._id);
      fetchNotifications();
      refresh();
      toast({ message: 'Aviso reabierto' });
      return true;
    } catch (err) {
      alert({
        icon: 'error',
        title: 'Error',
        message: obtenerMensajeErrorApi(err, 'Error al reabrir el aviso'),
      });
      return false;
    }
  };

  const openComplete = (n) => {
    setDetail(null);
    setComment('');
    setCompleteTarget(n);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-[28px] font-bold text-ios-label tracking-tight">Notificaciones</h1>
        {isAdmin && (
          <IosButton variant="tinted" size="sm" className="shadow-none" onClick={openCreate}>
            <IconPlus className="w-4 h-4" strokeWidth={2.2} />
            Nuevo Aviso
          </IosButton>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
          {error}
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl py-14 flex flex-col items-center shadow-ios-card">
          <div className="w-16 h-16 bg-ios-surface2 rounded-full flex items-center justify-center mb-4 border border-ios-separator/40">
            <IconBell className="w-7 h-7 text-ios-tertiary" strokeWidth={1.5} />
          </div>
          <p className="text-ios-tertiary text-sm">No hay avisos para mostrar</p>
        </div>
      ) : (
        <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl overflow-hidden shadow-ios-card divide-y divide-ios-separator/50">
          {notifications.map((n) => (
            <button
              key={n._id}
              onClick={() => setDetail(n)}
              className="w-full flex items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-ios-hover/[0.03] active:bg-ios-hover/[0.06]"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ios-label truncate">{n.titulo}</p>
                <p className="text-[11px] text-ios-tertiary mt-0.5">{formatDate(n.fechaCreacion)}</p>
              </div>
              <EstadoBadge estado={n.estado} />
              <IconChevronRight className="w-4 h-4 text-ios-tertiary shrink-0" />
            </button>
          ))}
        </div>
      )}

      <IosModal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.titulo}
        showCancel={false}
        footer={
          <div className="space-y-2">
            {detail && !isAdmin && detail.estado === 'pendiente' && (
              <IosButton variant="primary" className="w-full py-3" onClick={() => openComplete(detail)}>
                <IconCheck className="w-4 h-4" strokeWidth={2.4} />
                Marcar como realizado
              </IosButton>
            )}
            {isAdmin && detail?.estado === 'realizado' && (
              <IosButton variant="gray" className="w-full py-3" onClick={async () => { const ok = await handleReopen(detail); if (ok) setDetail(null); }}>
                <IconRefresh className="w-4 h-4" />
                Reabrir aviso
              </IosButton>
            )}
            {isAdmin && (
              <>
                <IosButton variant="tinted" className="w-full py-3" onClick={() => { openEdit(detail); setDetail(null); }}>
                  <IconPencil className="w-4 h-4" />
                  Editar aviso
                </IosButton>
                <IosButton variant="destructiveTinted" className="w-full py-3" onClick={async () => { const ok = await handleDelete(detail); if (ok) setDetail(null); }}>
                  <IconTrash className="w-4 h-4" />
                  Eliminar aviso
                </IosButton>
              </>
            )}
            <IosButton variant="gray" className="w-full py-3" onClick={() => setDetail(null)}>
              Cerrar
            </IosButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-[13px] font-medium text-ios-secondary mb-1.5">Descripción</p>
            <p className="text-sm text-ios-label whitespace-pre-line break-words max-h-[40vh] overflow-y-auto bg-ios-surface2/50 rounded-ios-control px-3.5 py-3">
              {detail?.descripcion}
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-ios-tertiary text-xs shrink-0 pt-0.5">Creado por</span>
              <span className="text-ios-secondary text-right text-[13px]">
                {detail?.creadoPor?.nombre || '—'} · {formatDate(detail?.fechaCreacion)}
              </span>
            </div>
            {detail?.estado === 'realizado' && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-ios-tertiary text-xs shrink-0 pt-0.5">Realizado por</span>
                  <span className="text-ios-secondary text-right text-[13px]">
                    {detail?.realizadoNombre || detail?.realizadoPor?.nombre || '—'} · {formatDate(detail?.realizadoEn)}
                  </span>
                </div>
                {detail?.comentario && (
                  <div>
                    <span className="text-ios-tertiary text-xs">Comentario</span>
                    <p className="text-ios-secondary text-[13px] italic bg-ios-surface2/60 rounded-ios-control px-3 py-2 mt-1 break-words whitespace-pre-line">
                      "{detail.comentario}"
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </IosModal>

      <IosModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Editar Aviso' : 'Nuevo Aviso'}
        confirmText={editing ? 'Guardar' : 'Crear'}
        onConfirm={handleSave}
        confirmDisabled={savingNotif}
      >
        <div className="space-y-4">
          <IosField label="Título" required>
            <IosInput
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ej: Limpiar la tienda"
            />
          </IosField>
          <IosField label="Descripción" required>
            <IosTextArea
              rows={4}
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Detalle de la tarea para el empleado…"
            />
          </IosField>
        </div>
      </IosModal>

      <IosModal
        open={!!completeTarget}
        onClose={() => setCompleteTarget(null)}
        title={completeTarget ? `Marcar "${completeTarget.titulo}" como realizado` : ''}
        confirmText="Confirmar"
        onConfirm={handleComplete}
        confirmDisabled={savingComplete}
      >
        <div className="space-y-4">
          <IosField label="Realizado por">
            <div className="px-3.5 py-2.5 bg-ios-surface2 rounded-ios-control text-ios-secondary text-sm truncate">
              {usuario?.nombre || '—'}
            </div>
          </IosField>
          <IosField label="Comentario (opcional)" hint="Contanos cómo quedó el trabajo">
            <IosTextArea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ej: Limpie la tienda y dejé todo en orden…"
            />
          </IosField>
        </div>
      </IosModal>
    </div>
  );
};

export default Notificaciones;