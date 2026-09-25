import { obtenerCategorias } from '../api/productos';
import { useApi } from './useApi';

export const useCategorias = () => {
  const { data, loading, run } = useApi(
    async () => {
      const res = await obtenerCategorias();
      return Array.isArray(res.data) ? res.data : [];
    },
    { mensajeError: 'Error al cargar categorías' }
  );

  return { categorias: data || [], loading, recargarCategorias: run };
};
