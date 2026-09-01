import { useState, useEffect } from 'react';
import {
  getNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
  completeNotification,
  reopenNotification,
} from '../../api/notifications';
import { getApiErrorMessage } from '../../utils/apiError';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import { IosField, IosInput, IosTextArea } from '../../components/ui/IosForm';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useIosAlert } from '../../components/alerts';
import { IconBell, IconPlus, IconPencil, IconTrash, IconCheck, IconRefresh, IconChevronRight } from '../../components/ui/icons';

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

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

const Notifications = () => {
  const { user } = useAuth();
  const { refresh, markVistasAdmin } = useNotifications();
  const { confirm, toast, show: alert } = useIosAlert();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ titulo: '', descripcion: '' });

  const [completeTarget, setCompleteTarget] = useState(null);
  const [completeName, setCompleteName] = useState('');
  const [comment, setComment] = useState('');

  const isAdmin = user?.rol === 'admin';

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    if (isAdmin) markVistasAdmin();
  }, [isAdmin]);

  const fetchNotifications = async () => {
    setError('');
    try {
      const res = await getNotifications();
      setNotifications(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al cargar avisos'));
    } finally {
      setLoading(false);
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
        await updateNotification(editing._id, form);
        toast({ message: 'Aviso actualizado' });
      } else {
        await createNotification(form);
        toast({ message: 'Aviso creado' });
      }
      setFormOpen(false);
      fetchNotifications();
      refresh();
    } catch (err) {
      alert({
        icon: 'error',
        title: 'Error',
        message: getApiErrorMessage(err, 'Error al guardar el aviso'),
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
    if (!confirmed) return;
    try {
      await deleteNotification(n._id);
      fetchNotifications();
      refresh();
      toast({ message: 'Aviso eliminado' });
    } catch (err) {
      alert({
        icon: 'error',
        title: 'Error',
        message: getApiErrorMessage(err, 'Error al eliminar el aviso'),
      });
    }
  };

  const handleComplete = async () => {
    if (!completeTarget) return;
    if (!completeName.trim()) {
      alert({
        icon: 'warning',
        title: 'Campo requerido',
        message: 'Debe indicar quién realizó la tarea',
      });
      return;
    }
    try {
      await completeNotification(completeTarget._id, {
        realizadoNombre: completeName.trim(),
        comentario: comment.trim(),
      });
      toast({ message: 'Aviso marcado como realizado' });
      setCompleteTarget(null);
      setCompleteName('');
      setComment('');
      fetchNotifications();
      refresh();
    } catch (err) {
      alert({
        icon: 'error',
        title: 'Error',
        message: getApiErrorMessage(err, 'Error al marcar el aviso'),
      });
    }
  };

  const handleReopen = async (n) => {
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Reabrir este aviso?',
      message: 'Volverá a estado pendiente y se borrará el comentario',
      confirmText: 'Reabrir',
    });
    if (!confirmed) return;
    try {
      await reopenNotification(n._id);
      fetchNotifications();
      refresh();
      toast({ message: 'Aviso reabierto' });
    } catch (err) {
      alert({
        icon: 'error',
        title: 'Error',
        message: getApiErrorMessage(err, 'Error al reabrir el aviso'),
      });
    }
  };

  const openComplete = (n) => {
    setDetail(null);
    setCompleteName('');
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
                <p className="text-[11px] text-ios-tertiary mt-0.5">{formatDate(n.createdAt)}</p>
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
              <IosButton variant="gray" className="w-full py-3" onClick={() => { handleReopen(detail); setDetail(null); }}>
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
                <IosButton variant="destructiveTinted" className="w-full py-3" onClick={() => { handleDelete(detail); setDetail(null); }}>
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
                {detail?.creadoPor?.nombre || '—'} · {formatDate(detail?.createdAt)}
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
      >
        <div className="space-y-4">
          <IosField label="¿Quién realizó la tarea?" required>
            <IosInput
              value={completeName}
              onChange={(e) => setCompleteName(e.target.value)}
              placeholder="Nombre del empleado"
            />
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

export default Notifications;