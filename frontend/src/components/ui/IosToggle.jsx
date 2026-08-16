const IosToggle = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      if (!disabled) onChange(!checked);
    }}
    className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 shrink-0 disabled:opacity-40 ${
      checked ? 'bg-ios-green' : 'bg-ios-surface3'
    }`}
  >
    <span
      className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-white rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-transform duration-200 ${
        checked ? 'translate-x-[20px]' : 'translate-x-0'
      }`}
    />
  </button>
);

export default IosToggle;