-- Customer account IDs are allocated atomically by generateAccountId().
-- Keep this migration safe for both a new baseline database and an existing
-- database whose customer rows predate the consolidated migration history.
CREATE SEQUENCE IF NOT EXISTS "customer_account_id_seq" AS BIGINT START WITH 1;

DO $$
DECLARE
  highest_account_number BIGINT;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING("account_id" FROM 9)::BIGINT), 0)
  INTO highest_account_number
  FROM "customers"
  WHERE "account_id" ~ '^LD-CUST-[0-9]+$';

  IF highest_account_number > 0 THEN
    PERFORM setval('customer_account_id_seq', highest_account_number, true);
  ELSE
    PERFORM setval('customer_account_id_seq', 1, false);
  END IF;
END $$;
