# Database migrations

Run these in **order** in the Supabase SQL Editor:

1. **000_base_schema.sql** – Creates `accounts`, `tweets`, `search_queries`.
2. **001_campaigns.sql** – Creates `campaigns`, `campaign_accounts`, `campaign_tweets`, `campaign_search_queries`, default x402 campaign, and migrates existing data into the default campaign (no-op on a fresh DB).

For a **new database**, run both files in order.

Campaign run flow (search → categorization) is described in the main [README](../README.md#campaign-run-flow).
