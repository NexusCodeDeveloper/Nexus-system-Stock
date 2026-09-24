import { describe, expect, it } from 'vitest';
import { pushModal, popModal, esTopModal, modalStackVacio } from './iosModalStack';

describe('iosModalStack', () => {
  it('apila y desapila modales marcando solo el último como superior', () => {
    expect(modalStackVacio()).toBe(true);

    const primero = pushModal(() => {});
    const segundo = pushModal(() => {});

    expect(modalStackVacio()).toBe(false);
    expect(esTopModal(primero)).toBe(false);
    expect(esTopModal(segundo)).toBe(true);

    popModal(segundo);
    expect(esTopModal(primero)).toBe(true);

    popModal(primero);
    expect(modalStackVacio()).toBe(true);
  });
});
