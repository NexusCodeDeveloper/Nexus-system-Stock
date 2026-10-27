import { useLayoutEffect, useRef, useState } from 'react';

const GAP = 8;

export const useDropdownAnclado = () => {
  const [dropdown, setDropdown] = useState({ product: null, x: 0, y: 0 });
  const menuRef = useRef(null);
  const anchorRef = useRef(null);

  useLayoutEffect(() => {
    if (!dropdown.product) return;
    const menu = menuRef.current;
    const rect = anchorRef.current;
    if (!menu || !rect) return;
    const W = menu.offsetWidth;
    const H = menu.offsetHeight;
    const nav = document.querySelector('nav');
    const navHeight = nav ? nav.getBoundingClientRect().height : 0;
    const bottomLimit = window.matchMedia('(max-width: 767px)').matches ? navHeight + GAP : 0;
    let x = rect.left;
    let y = rect.bottom + GAP;
    if (y + H > window.innerHeight - bottomLimit) {
      y = rect.top - GAP - H;
    }
    y = Math.max(GAP, Math.min(y, window.innerHeight - H - GAP - bottomLimit));
    if (x + W > window.innerWidth) {
      x = rect.right - W;
    }
    x = Math.max(GAP, Math.min(x, window.innerWidth - W - GAP));
    setDropdown((prev) => ({ ...prev, x, y }));
  }, [dropdown.product]);

  const toggle = (e, product) => {
    e.stopPropagation();
    if (dropdown.product?._id === product._id) {
      setDropdown({ product: null, x: 0, y: 0 });
    } else {
      anchorRef.current = e.currentTarget.getBoundingClientRect();
      setDropdown({ product, x: 0, y: 0 });
    }
  };

  const close = () => setDropdown({ product: null, x: 0, y: 0 });

  return { dropdown, menuRef, toggle, close };
};
