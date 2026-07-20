-- Signup used to auto-derive users.name from the email prefix; display
-- names are now only ever set deliberately in Settings, with the prefix
-- computed as a display-time fallback. Null out the derived values so the
-- Settings field reads as unset. A name that merely equals the prefix is
-- indistinguishable from a derived one, but nulling it renders identically.
UPDATE "users" SET "name" = NULL WHERE "name" = split_part("email", '@', 1);
