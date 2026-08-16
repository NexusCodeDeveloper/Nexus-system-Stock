import { IconCheck, IconX, IconAlert } from './alertIcons';

const toastStyles = {
  success: { icon: <IconCheck className="w-[18px] h-[18px]" strokeWidth={2.6} />, cls: 'text-ios-green', bg: 'bg-ios-green/10' },
  error: { icon: <IconX className="w-[18px] h-[18px]" strokeWidth={2.6} />, cls: 'text-ios-red', bg: 'bg-ios-red/10' },
  info: { icon: <IconAlert className="w-[18px] h-[18px]" strokeWidth={2.6} />, cls: 'text-ios-tint', bg: 'bg-ios-tint/10' },
};

const Toast = ({ toast }) => {
  const style = toastStyles[toast.type] || toastStyles.info;
  return (
    <div className="fixed top-4 inset-x-0 z-[95] flex justify-center px-4 pointer-events-none">
      <div className="max-w-sm w-full bg-ios-surface/85 backdrop-blur-2xl border border-ios-separator/50 rounded-ios-control shadow-ios-card px-4 py-3 flex items-center gap-3 animate-ios-toast pointer-events-auto">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.bg} ${style.cls}`}>
          {style.icon}
        </span>
        <p className="text-[14px] font-medium text-ios-label leading-snug">{toast.message}</p>
      </div>
    </div>
  );
};

export default Toast;