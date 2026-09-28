/**
 * Cart — localStorage-backed cart holding only product ids + quantities.
 * Prices shown here are for display; the server always re-prices at checkout.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CartItemInput, PublicProduct } from "@/lib/api/sdk";

export interface CartLine {
  product_id: string;
  slug: string;
  name: string;
  image: string | null;
  unit_price: number;
  quantity: number;
  size?: string;
  color?: string;
}

interface CartValue {
  lines: CartLine[];
  subtotal: number;
  count: number;
  addItem: (input: { product: PublicProduct; quantity?: number; size?: string; color?: string }) => void;
  setQuantity: (product_id: string, quantity: number) => void;
  removeItem: (product_id: string) => void;
  clear: () => void;
  /** Exact shape the API expects for /orders and /checkout. */
  toApiItems: () => CartItemInput[];
}

const STORAGE_KEY = "habane.cart.v1";
const CartCtx = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  // Read storage after mount so SSR and hydration agree.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      /* corrupt cart — start empty */
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines]);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      subtotal: lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0),
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      addItem: ({ product, quantity = 1, size, color }) =>
        setLines((current) => {
          const existing = current.find((l) => l.product_id === product.id);
          if (existing) {
            return current.map((l) =>
              l.product_id === product.id ? { ...l, quantity: l.quantity + quantity } : l,
            );
          }
          return [
            ...current,
            {
              product_id: product.id,
              slug: product.slug,
              name: product.name,
              image: product.card_image ?? product.images[0] ?? null,
              unit_price: product.price,
              quantity,
              ...(size ? { size } : {}),
              ...(color ? { color } : {}),
            },
          ];
        }),
      setQuantity: (product_id, quantity) =>
        setLines((current) =>
          quantity <= 0
            ? current.filter((l) => l.product_id !== product_id)
            : current.map((l) => (l.product_id === product_id ? { ...l, quantity } : l)),
        ),
      removeItem: (product_id) => setLines((c) => c.filter((l) => l.product_id !== product_id)),
      clear: () => setLines([]),
      toApiItems: () =>
        lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          ...(l.size ? { size: l.size } : {}),
          ...(l.color ? { color: l.color } : {}),
        })),
    }),
    [lines],
  );

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
