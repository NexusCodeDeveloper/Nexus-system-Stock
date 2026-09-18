export const printHtml = (html) =>
  new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('title', 'Impresión');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';

    let terminado = false;
    const limpiar = (resultado = true) => {
      if (terminado) return;
      terminado = true;
      setTimeout(() => frame.remove(), 1000);
      resolve(resultado);
    };

    const fallback = setTimeout(() => limpiar(false), 10000);

    frame.onload = () => {
      clearTimeout(fallback);
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!win || !doc) {
        limpiar(false);
        return;
      }

      const esperarImagenes = () =>
        Promise.all(
          Array.from(doc.images || []).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((r) => {
                  img.addEventListener('load', r, { once: true });
                  img.addEventListener('error', r, { once: true });
                })
          )
        );

      const imprimir = () => {
        try {
          win.focus();
          win.onafterprint = limpiar;
          win.print();
          setTimeout(limpiar, 60000);
        } catch {
          limpiar(false);
        }
      };

      if (doc.readyState === 'complete') {
        esperarImagenes().then(() => setTimeout(imprimir, 50));
      } else {
        doc.addEventListener('readystatechange', function onState() {
          if (doc.readyState === 'complete') {
            doc.removeEventListener('readystatechange', onState);
            esperarImagenes().then(() => setTimeout(imprimir, 50));
          }
        });
      }
    };

    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
