const ESTILOS = {
  agotado: 'bg-ios-red/15 text-ios-red',
  bajo: 'bg-amber-500/15 text-amber-400',
};

const ETIQUETAS = {
  agotado: 'Sin stock',
  bajo: 'Bajo',
};

const StockBadge = ({ estado, className = '' }) => {
  if (!estado || !ESTILOS[estado]) return null;
  return (
    <span className={`inline-flex items-center justify-center leading-none px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${ESTILOS[estado]} ${className}`}>
      {ETIQUETAS[estado]}
    </span>
  );
};

export default StockBadge;
