CREATE TABLE "customer_carts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "customer_carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "customer_cart_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_carts_customer_id_key" ON "customer_carts"("customer_id");
CREATE UNIQUE INDEX "customer_cart_items_cart_id_product_id_key" ON "customer_cart_items"("cart_id", "product_id");
ALTER TABLE "customer_carts" ADD CONSTRAINT "customer_carts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_cart_items" ADD CONSTRAINT "customer_cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "customer_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_cart_items" ADD CONSTRAINT "customer_cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
