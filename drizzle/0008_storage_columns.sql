-- Two derived columns, backfilled here and dropped-from in 0009:
--   drawings.searchText — the scene's live text, so the drawings list can be
--     searched without shipping every scene to the client.
--   drawing_files.bytes — the image bytes, replacing the base64 data URL
--     (about a third smaller).
-- Each row is converted in its own exception block: a scene or data URL that
-- does not parse must not fail the migration, which would stop the app from
-- booting. An unparseable scene keeps an empty searchText; an undecodable
-- data URL keeps a null bytes and is removed by 0009.
ALTER TABLE "drawing_files" ADD COLUMN "bytes" "bytea";--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "searchText" text DEFAULT '' NOT NULL;--> statement-breakpoint
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT "id", "data" FROM "drawings" LOOP
    BEGIN
      -- Mirrors extractSceneText in src/features/drawings/search.ts.
      UPDATE "drawings" SET "searchText" = coalesce((
        SELECT btrim(regexp_replace(
          string_agg(coalesce(e->>'originalText', e->>'text', ''), ' ' ORDER BY ord),
          '\s+', ' ', 'g'))
        FROM jsonb_array_elements(r."data"::jsonb->'elements') WITH ORDINALITY AS t(e, ord)
        WHERE e->>'type' = 'text' AND coalesce(e->>'isDeleted', 'false') <> 'true'
      ), '') WHERE "id" = r."id";
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;--> statement-breakpoint
DO $$
DECLARE r record; header text[]; body bytea; b64 text;
BEGIN
  -- Decodes like a browser loading the data URL into an <img>: percent-escapes
  -- first, then base64 if the header says so, ignoring whitespace and padding.
  FOR r IN SELECT "id", "dataUrl" FROM "drawing_files"
    WHERE "dataUrl" ~ '^data:[^,]*,.' LOOP
    BEGIN
      header := string_to_array(substring(r."dataUrl" from '^data:([^,]*),'), ';');
      SELECT decode(string_agg(coalesce(m[1], encode(convert_to(m[2], 'UTF8'), 'hex')), '' ORDER BY n), 'hex')
        INTO body
        FROM regexp_matches(substring(r."dataUrl" from position(',' in r."dataUrl") + 1),
          '%([0-9A-Fa-f]{2})|([^%]+|%)', 'g') WITH ORDINALITY AS t(m, n);
      IF lower(header[cardinality(header)]) = 'base64' THEN
        b64 := rtrim(regexp_replace(convert_from(body, 'UTF8'), '\s', '', 'g'), '=');
        body := decode(rpad(b64, (length(b64) + 3) / 4 * 4, '='), 'base64');
      END IF;
      UPDATE "drawing_files" SET
        "bytes" = body,
        "mimeType" = coalesce(nullif(lower(btrim(header[1])), ''), "mimeType")
      WHERE "id" = r."id";
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;
