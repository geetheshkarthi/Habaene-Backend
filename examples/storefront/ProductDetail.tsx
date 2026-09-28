/**
 * Product detail — single product by slug, with add-to-cart.
 * SDK: getProduct()
 */
import { useEffect, useState } from "react";
import { api } from "./client";
import { HabaneApiError, type PublicProduct } from "@/lib/api/sdk";
import { useCart } from "./CartContext";

export function ProductDetail({ slug }: { slug: string }) {
  const { addItem } = useCart();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getProduct(slug)
      .then((p) => {
        if (cancelled) return;
        setProduct(p);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof HabaneApiError && error.code === "not_found") {
          setStatus("missing");
          return;
        }
        setMessage(error instanceof Error ? error.message : "Something went wrong");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status === "loading") return <p>Loading…</p>;
  if (status === "missing") return <p>This product is no longer available.</p>;
  if (status === "error" || !product) return <p role="alert">{message}</p>;

  return (
    <article>
      <h1>{product.name}</h1>
      <p>{product.subtitle}</p>
      {product.images.map((src) => (
        <img key={src} src={src} alt={product.name} />
      ))}
      <p>{product.description}</p>
      <p>
        {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(product.price)}{" "}
        <small>incl. {product.vat_rate}% VAT</small>
      </p>

      <button
        disabled={!product.in_stock}
        onClick={() => addItem({ product, quantity: 1 })}
      >
        {product.in_stock ? "Add to cart" : "Sold out"}
      </button>
    </article>
  );
}
