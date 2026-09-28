/**
 * Product listing — catalogue grid with category + search filters.
 * SDK: getProducts()
 */
import { useEffect, useState } from "react";
import { api } from "./client";
import { HabaneApiError, type PublicProduct } from "@/lib/api/sdk";

type Category = "system" | "carry" | "luggage";

export function ProductListing() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getProducts({
        ...(category === "all" ? {} : { category }),
        ...(search ? { search } : {}),
        limit: 24,
        offset: 0,
      })
      .then((result) => {
        if (cancelled) return;
        setProducts(result.items);
        setTotal(result.total);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof HabaneApiError ? err.message : "Could not load products");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category, search]);

  if (loading) return <p>Loading catalogue…</p>;
  if (error) return <p role="alert">{error}</p>;

  return (
    <section>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products"
        aria-label="Search products"
      />
      {(["all", "system", "carry", "luggage"] as const).map((c) => (
        <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c}>
          {c}
        </button>
      ))}

      <p>{total} products</p>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            <a href={`/products/${product.slug}`}>
              {product.card_image ? (
                <img src={product.card_image} alt={product.name} loading="lazy" />
              ) : null}
              <h2>{product.name}</h2>
              <p>{product.subtitle}</p>
              <p>{new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(product.price)}</p>
              {!product.in_stock && <span>Sold out</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
