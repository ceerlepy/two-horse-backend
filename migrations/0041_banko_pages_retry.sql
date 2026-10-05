-- Banko foreign pages fetched before URL discovery from the /ai-tahmin/
-- listing existed were all classified "missing" (a Cloudflare challenge
-- looked the same). Let them be fetched again on the next tick.
DELETE FROM foreign_expert_pages WHERE status <> 'ok';
