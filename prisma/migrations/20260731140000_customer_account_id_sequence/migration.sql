-- Serialized sequence backing the LD-CUST-XXXXXX customer account IDs.
-- Unlike the previous "read max + 1" approach, nextval() is atomic, so two
-- concurrent customer registrations can never be handed the same account ID.
CREATE SEQUENCE IF NOT EXISTS customer_account_id_seq START WITH 1;

-- Seed the sequence past any existing account IDs so we never collide.
SELECT setval(
    'customer_account_id_seq',
    COALESCE((
        SELECT MAX(CAST(substr(account_id, 9) AS BIGINT))
        FROM customers
        WHERE account_id ~ '^LD-CUST-[0-9]+$'
    ), 0)
);
