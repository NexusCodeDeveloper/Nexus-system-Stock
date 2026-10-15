import { useEffect, useRef, useState } from 'react';
import { obtenerProductos, obtenerProductoPorCodigo, restaurarProducto, eliminarProductoDefinitivo } from '../../api/productos';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import { formatDate } from '../../utils/format';
import { depositoTotal, salonTotal } from '../../utils/productos';
import { calcularPagina } from '../../utils/paginacion';
import { useApi } from '../../hooks/useApi';
import { useLector } from '../../context/lectorContexto';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Paginacion from '../../components/common/Paginacion';
import IosSearch from '../../components/ui/IosSearch';
import { useIosAlert } from '../../components/alerts';
import { IconArchive, IconRefresh, IconReturn, IconTrash, IconWarehouse } from '../../components/ui/icons';

const Papelera = () => {
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [resaltadoId, setResaltadoId] = useState(null);
  const [pendienteResaltar, setPendienteResaltar] = useState(null);
  const ultimoEscaneoRef = useRef({ codigo: '', ts: 0 });
  const montadoRef = useRef(true);
  const { show: alert, confirm, toast } = useIosAlert();

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPagina(1);
  }, [searchDebounced]);

  const papeleraApi = useApi(
    async () => {
      const params = {
        papelera: 1,
        offset: (pagina - 1) * porPagina,
        limit: porPagina,
        conTotal: 1,
      };
      if (searchDebounced.trim()) params.search = searchDebounced.trim();
      const res = await obtenerProductos(params);
      return {
        lista: Array.isArray(res.data?.productos) ? res.data.productos : [],
        total: Number(res.data?.total) || 0,
      };
    },
    { deps: [searchDebounced, pagina, porPagina], mensajeError: 'Error al cargar la papelera' }
  );

  const { run: recargar, loading, error } = papeleraApi;
  const productos = papeleraApi.error ? [] : papeleraApi.data?.lista || [];
  const total = papeleraApi.error ? 0 : papeleraApi.data?.total || 0;
  const { totalPaginas } = calcularPagina(total, porPagina, pagina);

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const manejarCodigoEscaneado = async (codigo) => {
    const ahora = Date.now();
    if (codigo === ultimoEscaneoRef.current.codigo && ahora - ultimoEscaneoRef.current.ts < 800) return;
    ultimoEscaneoRef.current = { codigo, ts: ahora };
    try {
      const { data: producto } = await obtenerProductoPorCodigo(codigo);
      toast({
        message: `"${producto.nombre}" está activo: no está en la papelera.`,
        duration: 3200,
      });
    } catch (err) {
      if (err.response?.status === 410 || err.response?.data?.code === 'EN_PAPELERA') {
        let encontrado = null;
        try {
          const res = await obtenerProductos({ papelera: 1, search: codigo, limit: 1 });
          const lista = Array.isArray(res.data) ? res.data : res.data?.productos || [];
          encontrado = lista[0] || null;
        } catch {
          /* si falla la búsqueda, igual mostramos el aviso */
        }
        if (!montadoRef.current) return;
        if (encontrado) setPendienteResaltar(encontrado._id);
        setSearch(codigo);
        toast({ message: 'Producto encontrado en la papelera', duration: 2200 });
        return;
      }
      if (err.response?.status === 404) {
        toast({ message: `No existe un producto con el código "${codigo}".`, duration: 3200 });
        return;
      }
      toast({ message: obtenerMensajeErrorApi(err, 'Error al buscar el código') });
    }
  };

  useLector(manejarCodigoEscaneado);

  useEffect(() => {
    if (!pendienteResaltar) return;
    const visible = [...document.querySelectorAll(`[data-producto-id="${pendienteResaltar}"]`)]
      .find((el) => el.offsetParent !== null);
    if (!visible) return;
    setResaltadoId(pendienteResaltar);
    setPendienteResaltar(null);
  }, [pendienteResaltar, papeleraApi.data]);

  useEffect(() => {
    if (!pendienteResaltar) return undefined;
    const timer = setTimeout(() => setPendienteResaltar(null), 4000);
    return () => clearTimeout(timer);
  }, [pendienteResaltar]);

  useEffect(() => {
    if (!resaltadoId) return undefined;
    const visibles = [...document.querySelectorAll('[data-item-resaltado="true"]')];
    visibles.find((el) => el.offsetParent !== null)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = setTimeout(() => setResaltadoId(null), 3200);
    return () => clearTimeout(timer);
  }, [resaltadoId]);

  const handleRestaurar = async (p) => {
    const ok = await confirm({
      icon: 'info',
      title: `¿Restaurar "${p.nombre}"?`,
      message: 'Vuelve al catálogo y a las ventas con su stock tal como estaba.',
      confirmText: 'Restaurar',
    });
    if (!ok) return;
    try {
      await restaurarProducto(p._id);
      recargar();
      toast({ message: 'Producto restaurado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al restaurar producto') });
    }
  };

  const handleEliminarDefinitivo = async (p) => {
    const ok = await confirm({
      icon: 'warning',
      title: `¿Eliminar "${p.nombre}" para siempre?`,
      message: 'Esta acción no se puede deshacer. El historial de ventas, devoluciones y movimientos se conserva.',
      confirmText: 'Eliminar definitivamente',
      destructive: true,
    });
    if (!ok) return;
    try {
      await eliminarProductoDefinitivo(p._id);
      recargar();
      toast({ message: 'Producto eliminado definitivamente' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar producto') });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[28px] font-bold text-ios-label tracking-tight flex items-center gap-2.5">
            <IconArchive className="w-7 h-7 text-ios-secondary" strokeWidth={1.8} />
            Papelera
          </h1>
          <p className="text-sm text-ios-tertiary mt-1">
            Los productos eliminados quedan acá. Podés restaurarlos o borrarlos definitivamente.
          </p>
        </div>
        <button
          onClick={() => recargar()}
          className="btn-vivo btn-vivo-gris flex items-center gap-2 px-3.5 py-2 rounded-ios-pill text-sm font-semibold self-start sm:self-auto"
        >
          <IconRefresh className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      <div className="mb-4">
        <IosSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, categoría o código..."
          className="w-full md:w-96"
        />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : productos.length === 0 ? (
        <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl py-14 flex flex-col items-center shadow-ios-card">
          <div className="w-16 h-16 bg-ios-surface2 rounded-full flex items-center justify-center mb-4 border border-ios-separator/40">
            <IconArchive className="w-7 h-7 text-ios-tertiary" strokeWidth={1.5} />
          </div>
          <p className="text-ios-tertiary text-sm">
            {search ? `No hay productos eliminados que coincidan con "${search}"` : 'La papelera está vacía'}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-ios-surface rounded-3xl overflow-hidden shadow-ios-card border border-ios-separator/30">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Producto</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Código</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Stock</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Eliminado</th>
                  <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr
                    key={p._id}
                    data-producto-id={p._id}
                    data-item-resaltado={resaltadoId === p._id ? 'true' : undefined}
                    className={`border-t border-ios-separator/30 transition-all duration-500 ${
                      resaltadoId === p._id ? 'bg-ios-green/10 animate-ios-scan' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-ios-label">{p.nombre}</p>
                      <p className="text-[11px] text-ios-tertiary mt-0.5">{p.categoria || '—'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-ios-secondary text-xs tabular-nums">{p.codigo || '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs text-ios-secondary tabular-nums">
                        <IconWarehouse className="w-3.5 h-3.5 text-ios-tertiary" />
                        Salón {salonTotal(p)} · Dep {depositoTotal(p)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-ios-tertiary text-xs">
                      {p.eliminadoEn ? formatDate(p.eliminadoEn) : '—'}
                      {p.eliminadoPor ? <span className="block mt-0.5">por {p.eliminadoPor}</span> : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRestaurar(p)}
                          className="btn-vivo btn-vivo-azul flex items-center gap-1.5 px-3 py-1.5 rounded-ios-control text-xs font-semibold"
                        >
                          <IconReturn className="w-3.5 h-3.5" />
                          Restaurar
                        </button>
                        <button
                          onClick={() => handleEliminarDefinitivo(p)}
                          className="btn-vivo btn-vivo-rojo flex items-center gap-1.5 px-3 py-1.5 rounded-ios-control text-xs font-semibold"
                        >
                          <IconTrash className="w-3.5 h-3.5" />
                          Eliminar definitivamente
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2.5">
            {productos.map((p) => (
              <div
                key={p._id}
                data-producto-id={p._id}
                data-item-resaltado={resaltadoId === p._id ? 'true' : undefined}
                className={`bg-ios-surface border rounded-2xl px-4 py-3.5 shadow-ios-card transition-all duration-500 ${
                  resaltadoId === p._id ? 'border-ios-green/60 ring-2 ring-ios-green/40 bg-ios-green/10 animate-ios-scan' : 'border-ios-separator/30'
                }`}
              >
                <p className="font-semibold text-ios-label">{p.nombre}</p>
                <p className="text-xs text-ios-tertiary mt-0.5">
                  {p.categoria || '—'}
                  {p.codigo ? ` · ${p.codigo}` : ''}
                </p>
                <p className="text-xs text-ios-tertiary mt-1.5">
                  Salón {salonTotal(p)} · Dep {depositoTotal(p)}
                </p>
                <p className="text-[11px] text-ios-tertiary mt-1">
                  Eliminado {p.eliminadoEn ? formatDate(p.eliminadoEn) : '—'}
                  {p.eliminadoPor ? ` por ${p.eliminadoPor}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => handleRestaurar(p)}
                    className="btn-vivo btn-vivo-azul flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-ios-control text-xs font-semibold"
                  >
                    <IconReturn className="w-3.5 h-3.5" />
                    Restaurar
                  </button>
                  <button
                    onClick={() => handleEliminarDefinitivo(p)}
                    className="btn-vivo btn-vivo-rojo flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-ios-control text-xs font-semibold"
                  >
                    <IconTrash className="w-3.5 h-3.5" />
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Paginacion
            pagina={pagina}
            porPagina={porPagina}
            total={total}
            onPagina={setPagina}
            onPorPagina={setPorPagina}
            className="mt-5"
          />
        </>
      )}
    </div>
  );
};

export default Papelera;
