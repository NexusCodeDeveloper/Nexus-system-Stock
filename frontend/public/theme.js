try {
  var t = localStorage.getItem('theme');
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
} catch (e) {}