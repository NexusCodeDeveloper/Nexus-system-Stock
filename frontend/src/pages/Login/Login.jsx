import { useState } from 'react';
import { loginUser } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { getApiErrorMessage } from '../../utils/apiError';
import IosButton from '../../components/ui/IosButton';
import { IconEye, IconEyeOff } from '../../components/ui/icons';

const LoginModal = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginUser({ ...form, email: form.email.trim() });
      login(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al iniciar sesión'));
    } finally {
      setLoading(false);    
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xl" />
      <div className="relative w-full max-w-sm bg-ios-surface rounded-3xl shadow-ios-alert border border-ios-separator/50 p-8 animate-ios-centered">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-[22px] bg-gradient-to-br from-ios-tint to-blue-600 flex items-center justify-center shadow-[0_12px_32px_rgba(10,132,255,0.45)] ring-1 ring-white/20">
            <span className="text-2xl font-bold text-white tracking-wide">NC</span>
          </div>
        </div>

        <div className="text-center mb-7">
          <h1 className="text-[28px] font-bold text-ios-label tracking-tight">NexusCode</h1>
          <p className="text-ios-secondary text-sm mt-1 font-medium">Iniciar sesión</p>
        </div>

        {error && (
          <div className="bg-ios-red/10 text-ios-red px-4 py-2.5 rounded-ios-control mb-4 text-[13px] font-medium flex items-center gap-2.5">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-[13px] text-ios-secondary font-medium ml-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-3 bg-ios-surface2 rounded-ios-control text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all"
              placeholder="usuario@ejemplo.com"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] text-ios-secondary font-medium ml-1">Contraseña</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-3 pr-11 bg-ios-surface2 rounded-ios-control text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-tertiary hover:text-ios-label transition-colors p-1"
                aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPw ? <IconEyeOff className="w-5 h-5" /> : <IconEye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <IosButton
            type="submit"
            disabled={loading}
            size="lg"
            className="w-full py-3.5 rounded-ios-pill mt-2"
            variant="primary"
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Ingresando...
              </>
            ) : (
              'Ingresar'
            )}
          </IosButton>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;