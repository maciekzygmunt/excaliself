import { sql } from "drizzle-orm"
import {
  boolean,
  customType,
  foreignKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").default(false),
  name: text("name"),
  image: text("image"),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  createdAt: timestamp("createdAt")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt")
    .notNull()
    .$defaultFn(() => new Date()),
})

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt")
    .notNull()
    .$defaultFn(() => new Date()),
})

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  idToken: text("idToken"),
  createdAt: timestamp("createdAt")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt")
    .notNull()
    .$defaultFn(() => new Date()),
})

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt")
    .notNull()
    .$defaultFn(() => new Date()),
})

export const invites = pgTable("invites", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  invitedBy: text("invitedBy")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  usedBy: text("usedBy").references(() => users.id, { onDelete: "set null" }),
  usedAt: timestamp("usedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt")
    .notNull()
    .$defaultFn(() => new Date()),
})

// Admin-generated password-reset links (issue #68) — the product's only
// reset flow, shared out-of-band. Same single-use token model as invites,
// but targeted at a user and short-lived (24 h).
export const passwordResets = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdBy: text("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    usedAt: timestamp("usedAt"),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // At most one unused reset per user, enforced by the database — the
    // upsert in createPasswordReset targets this index so concurrent
    // generations serialize instead of leaving two live links.
    onePendingPerUser: uniqueIndex("password_resets_one_pending_per_user")
      .on(table.userId)
      .where(sql`${table.usedAt} is null`),
  }),
)

export const folders = pgTable(
  "folders",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerId: text("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: text("parentId"),
    // Soft delete: set means "in trash". trashRootId records the trash unit —
    // the id of the folder/drawing whose trashing swept this row along — so a
    // whole subtree can be restored as one unit while each row's trashed
    // state stays individually knowable.
    deletedAt: timestamp("deletedAt"),
    trashRootId: text("trashRootId"),
    createdAt: timestamp("createdAt")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updatedAt")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    parentReference: foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("cascade"),
  }),
)

export const drawings = pgTable("drawings", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  data: text("data").notNull().default("{}"),
  // The scene's text, derived on every write so lists can search without
  // shipping scenes.
  searchText: text("searchText").notNull().default(""),
  folderId: text("folderId").references(() => folders.id, {
    onDelete: "cascade",
  }),
  ownerId: text("ownerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  starred: boolean("starred").notNull().default(false),
  // Soft delete — see folders.deletedAt/trashRootId for the model.
  deletedAt: timestamp("deletedAt"),
  trashRootId: text("trashRootId"),
  createdAt: timestamp("createdAt")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt")
    .notNull()
    .$defaultFn(() => new Date()),
})

// A drawing is shared iff it has a row here; at most one link per drawing.
export const shares = pgTable(
  "shares",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    drawingId: text("drawingId")
      .notNull()
      .references(() => drawings.id, { onDelete: "cascade" }),
    audience: text("audience", { enum: ["members", "anyone"] })
      .notNull()
      .default("members"),
    createdAt: timestamp("createdAt")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    oneLinkPerDrawing: uniqueIndex("shares_one_link_per_drawing").on(
      table.drawingId,
    ),
  }),
)

// node-postgres reads and writes bytea as a Buffer.
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" })

export const drawingFiles = pgTable("drawing_files", {
  id: text("id").primaryKey(),
  drawingId: text("drawingId")
    .notNull()
    .references(() => drawings.id, { onDelete: "cascade" }),
  fileId: text("fileId").notNull(),
  mimeType: text("mimeType").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("createdAt")
    .notNull()
    .$defaultFn(() => new Date()),
})
