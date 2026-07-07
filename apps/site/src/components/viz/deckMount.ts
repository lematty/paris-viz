/**
 * Create a Deck one animation frame after mount, finalize it on unmount.
 *
 * The deferred creation dodges React StrictMode's dev double-mount: Deck
 * appends its canvas to the parent asynchronously (after GPU device init),
 * so a Deck created and finalized in the same tick still appends a zombie
 * canvas afterwards, which shifts the real canvas out of place. Deferring by
 * a frame means the immediately-unmounted first pass never creates a Deck.
 *
 * Returns the effect cleanup. `destroy` runs before finalize (clear refs).
 */
export function mountDeck<D extends { finalize(): void }>(
  create: () => D,
  destroy?: () => void,
): () => void {
  let deck: D | null = null;
  const raf = requestAnimationFrame(() => {
    deck = create();
  });
  return () => {
    cancelAnimationFrame(raf);
    destroy?.();
    deck?.finalize();
  };
}
