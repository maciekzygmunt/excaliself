# Excalidraw Self-Hosted with Persistent Storage

A self-hosted Excalidraw alternative with persistent storage, user accounts, and admin panel.

## Tech Stack

| Layer | Technology | Reason |
|-------|------------|--------|
| **Frontend** | TanStack Start + TypeScript | User's choice, full-stack React framework |
| **UI Components** | shadcn/ui + Tailwind CSS | Modern, accessible, customizable |
| **Authentication** | Better Auth | TypeScript-first, simple setup, invite-only support |
| **Database** | SQLite + Drizzle ORM | Easy self-hosting (single file), excellent performance |
| **Canvas** | @excalidraw/excalidraw | Official React component |
| **Deployment** | Docker | Simple self-hosting |

### Why SQLite + Drizzle?

- **Self-hosting simplicity**: Single database file, no separate DB server needed
- **Performance**: SQLite handles JSON well, fast for read-heavy workloads
- **Drizzle**: Type-safe, lightweight ORM with great DX
- **Excalidraw data**: Store as JSON blob in a TEXT column (typical canvas is <1MB)
- **Scalability**: SQLite handles millions of drawings; can migrate to PostgreSQL later if needed

## Database Schema

```
users
├── id (text, primary key)
├── email (text, unique)
├── name (text)
├── role (text: 'admin' | 'user')
├── createdAt (timestamp)
└── ...better-auth fields

invites
├── id (text, primary key)
├── email (text)
├── token (text, unique)
├── invitedBy (text, FK -> users)
├── usedAt (timestamp, nullable)
├── expiresAt (timestamp)
└── createdAt (timestamp)

drawings
├── id (text, primary key, UUID)
├── name (text)
├── data (text, JSON blob - elements + appState)
├── thumbnail (text, nullable - base64 preview)
├── ownerId (text, FK -> users)
├── isPublic (boolean, default false)
├── createdAt (timestamp)
└── updatedAt (timestamp)

drawing_files
├── id (text, primary key)
├── drawingId (text, FK -> drawings)
├── fileId (text - Excalidraw file reference)
├── mimeType (text)
├── dataUrl (text - base64 encoded image)
└── createdAt (timestamp)
```

> **Note**: `drawing_files` stores images separately for better performance. Large base64 images stay out of the main JSON blob.

---

## Implementation Plan

### Phase 1: Project Setup

- [x] **1.1** Initialize TanStack Start project with TypeScript
  ```bash
  npx create-start-app@latest excalidraw-selfhosted
  ```

- [x] **1.2** Install dependencies
  ```bash
  pnpm add @excalidraw/excalidraw drizzle-orm better-sqlite3 better-auth
  pnpm add -D drizzle-kit @types/better-sqlite3 tailwindcss
  ```

- [x] **1.3** Setup Tailwind CSS + shadcn/ui
  ```bash
  npx shadcn@latest init
  ```

- [x] **1.4** Create project structure
  ```
  src/
  ├── routes/
  │   ├── __root.tsx
  │   ├── index.tsx                 # Dashboard (list drawings)
  │   ├── login.tsx                 # Login page
  │   ├── invite.tsx                # Accept invite page
  │   ├── draw/
  │   │   ├── $id.tsx               # Edit drawing
  │   │   └── new.tsx               # New drawing
  │   └── admin/
  │       ├── index.tsx             # Admin dashboard
  │       └── users.tsx             # User management
  ├── lib/
  │   ├── db/
  │   │   ├── index.ts              # Database connection
  │   │   └── schema.ts             # Drizzle schema
  │   ├── auth.ts                   # Better Auth config
  │   └── auth-client.ts            # Client-side auth
  ├── components/
  │   ├── ExcalidrawCanvas.tsx      # Excalidraw wrapper
  │   ├── DrawingCard.tsx           # Drawing thumbnail card
  │   ├── Header.tsx                # App header
  │   └── ui/                       # shadcn components
  └── server/
      ├── drawings.ts               # Drawing CRUD functions
      ├── users.ts                  # User management functions
      └── invites.ts                # Invite functions
  ```

---

### Phase 2: Database Setup

- [x] **2.1** Create Drizzle schema (`src/lib/db/schema.ts`)
  - Users table (Better Auth compatible)
  - Invites table
  - Drawings table
  - Drawing files table

- [x] **2.2** Setup database connection (`src/lib/db/index.ts`)
  ```typescript
  import { drizzle } from 'drizzle-orm/better-sqlite3';
  import Database from 'better-sqlite3';

  const sqlite = new Database('./data/excalidraw.db');
  export const db = drizzle(sqlite);
  ```

- [x] **2.3** Create migration scripts
  ```bash
  pnpm drizzle-kit generate
  pnpm drizzle-kit migrate
  ```

- [x] **2.4** Verify database auto-creates on first run

---

### Phase 3: Authentication & First-Run Setup

- [x] **3.1** Configure Better Auth (`src/lib/auth.ts`)
  - Email/password authentication
  - Session management with HTTP-only cookies
  - Role-based access (admin/user)
  - **Disable public registration** (invite-only)

- [x] **3.2** Create auth client (`src/lib/auth-client.ts`)

- [x] **3.3** Setup auth API route (`src/routes/api/auth/$.ts`)

- [x] **3.4** Create setup wizard (`src/routes/setup.tsx`)
  - **Only accessible when no users exist in database**
  - Admin creates their account (email + password)
  - First user automatically gets `role: 'admin'`
  - Redirects to dashboard after setup
  - Shows "Setup complete" if admin already exists

- [x] **3.5** Create login page (`src/routes/login.tsx`)
  - Email/password form
  - Redirect to dashboard on success
  - Link to setup page if no users exist

- [x] **3.6** Implement auth middleware
  ```typescript
  export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    return next({ context: { session } });
  });
  ```

- [x] **3.7** Create setup check middleware
  ```typescript
  // Redirect to /setup if no users exist
  export const setupCheckMiddleware = createMiddleware().server(async ({ next }) => {
    const userCount = await db.select({ count: count() }).from(users);
    const isSetupComplete = userCount[0].count > 0;
    return next({ context: { isSetupComplete } });
  });
  ```

- [x] **3.8** Protect routes with beforeLoad
  - If not setup → redirect to `/setup`
  - If not logged in → redirect to `/login`
  - If not admin (for admin routes) → redirect to `/`

---

### Phase 4: Invite System

- [x] **4.1** Create invite server functions (`src/server/invites.ts`)
  - `createInvite(email)` - Admin only, generates unique token
  - `validateInvite(token)` - Check if invite is valid
  - `consumeInvite(token, userId)` - Mark invite as used

- [x] **4.2** Create invite acceptance page (`src/routes/invite.tsx`)
  - Validate token from URL
  - Show registration form
  - Create user and consume invite

- [x] **4.3** Add invite management to admin panel
  - List pending invites
  - Create new invites
  - Revoke invites

---

### Phase 5: Excalidraw Integration

- [x] **5.1** Create Excalidraw wrapper component (`src/components/ExcalidrawCanvas.tsx`)
  ```typescript
  import { Excalidraw } from '@excalidraw/excalidraw';

  export function ExcalidrawCanvas({ 
    initialData,
    onChange,
    onSave
  }: Props) {
    // Handle Excalidraw state changes
    // Auto-save with debounce
    // Export thumbnail for preview
  }
  ```

- [x] **5.2** Handle Excalidraw data serialization
  - Extract `elements` and `appState` for storage
  - Separate `files` (images) to drawing_files table
  - Compress data if needed

- [x] **5.3** Create drawing server functions (`src/server/drawings.ts`)
  - `getDrawings()` - List user's drawings
  - `getDrawing(id)` - Get single drawing with files
  - `createDrawing(name)` - Create new drawing
  - `updateDrawing(id, data)` - Save drawing data
  - `deleteDrawing(id)` - Delete drawing
  - `updateDrawingFiles(id, files)` - Update embedded images

---

### Phase 6: Drawing Pages

- [x] **6.1** Create dashboard (`src/routes/index.tsx`)
  - Grid of drawing cards with thumbnails
  - "New Drawing" button
  - Search/filter drawings
  - Delete confirmation modal

- [x] **6.2** Create new drawing page (`src/routes/draw/new.tsx`)
  - Auto-create drawing record
  - Redirect to edit page

- [x] **6.3** Create drawing editor (`src/routes/draw/$id.tsx`)
  - Load existing drawing data
  - Full-screen Excalidraw canvas
  - Auto-save on changes (debounced)
  - Manual save button
  - Back to dashboard button
  - Rename drawing

- [x] **6.4** Add drawing card component (`src/components/DrawingCard.tsx`)
  - Thumbnail preview
  - Title and last modified
  - Quick actions (delete, duplicate)

---

### Phase 7: Admin Panel

- [x] **7.1** Create admin layout with navigation

- [x] **7.2** Admin dashboard (`src/routes/admin/index.tsx`)
  - User count
  - Drawing count
  - Recent activity

- [ ] **7.3** User management (`src/routes/admin/users.tsx`)
  - List all users
  - Change user roles
  - Deactivate users
  - View user's drawings

- [x] **7.4** Invite management
  - Send invites by email
  - Copy invite links
  - View pending/used invites

- [x] **7.5** Admin-only middleware
  ```typescript
  beforeLoad: async ({ context }) => {
    if (context.session?.user?.role !== 'admin') {
      throw redirect({ to: '/' });
    }
  }
  ```

---

### Phase 8: Polish & UX

- [ ] **8.1** Add loading states and skeletons

- [ ] **8.2** Error handling and toast notifications

- [ ] **8.3** Responsive design for mobile

- [ ] **8.4** Keyboard shortcuts
  - `Ctrl+S` - Save drawing
  - `Ctrl+N` - New drawing
  - `Escape` - Back to dashboard

- [ ] **8.5** Export functionality
  - Export as PNG
  - Export as SVG
  - Export as .excalidraw file

---

### Phase 9: Docker & Deployment

- [x] **9.1** Create Dockerfile
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --only=production
  COPY . .
  RUN npm run build
  VOLUME /app/data
  EXPOSE 3000
  CMD ["npm", "start"]
  ```

- [x] **9.2** Create docker-compose.yml
  ```yaml
  version: '3.8'
  services:
    excalidraw:
      build: .
      ports:
        - "3000:3000"
      volumes:
        - ./data:/app/data
      environment:
        - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
  ```

- [x] **9.3** Create .env.example

- [x] **9.4** Write deployment documentation (README.md)

- [ ] **9.5** Add health check endpoint

---

### Phase 10: Optional Enhancements

- [ ] **10.1** Collaboration (real-time sync)
  - WebSocket server for live updates
  - Presence indicators
  - Conflict resolution

- [ ] **10.2** Drawing sharing
  - Public/private toggle
  - Share links with view-only access

- [ ] **10.3** Drawing folders/organization

- [ ] **10.4** Drawing versioning/history

- [ ] **10.5** Library management (custom shapes/templates)

---

## Environment Variables

```env
# Required
BETTER_AUTH_SECRET=your-secret-key-min-32-chars
BASE_URL=http://localhost:3000

# Optional
DATABASE_PATH=./data/excalidraw.db
```

---

## Quick Start (After Implementation)

```bash
# Clone the repository
git clone https://github.com/your-repo/excalidraw-selfhosted.git
cd excalidraw-selfhosted

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Run with Docker
docker-compose up -d

# Or run locally
pnpm install
pnpm db:migrate
pnpm dev
```

Access at `http://localhost:3000`.

### First-Run Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Fresh Deploy                                               │
│  ↓                                                          │
│  Visit http://localhost:3000                                │
│  ↓                                                          │
│  No users? → Redirect to /setup                             │
│  ↓                                                          │
│  ┌─────────────────────────────────────┐                    │
│  │  🔧 Setup Your Instance             │                    │
│  │                                     │                    │
│  │  Create Admin Account               │                    │
│  │  ┌───────────────────────────────┐  │                    │
│  │  │ Email: admin@company.com      │  │                    │
│  │  └───────────────────────────────┘  │                    │
│  │  ┌───────────────────────────────┐  │                    │
│  │  │ Password: ••••••••••          │  │                    │
│  │  └───────────────────────────────┘  │                    │
│  │  ┌───────────────────────────────┐  │                    │
│  │  │ Confirm: ••••••••••           │  │                    │
│  │  └───────────────────────────────┘  │                    │
│  │                                     │                    │
│  │  [Create Admin & Start →]           │                    │
│  └─────────────────────────────────────┘                    │
│  ↓                                                          │
│  Admin created → Redirect to Dashboard                      │
│  ↓                                                          │
│  Admin Panel → Invite Users → They register via invite link │
└─────────────────────────────────────────────────────────────┘
```

**After setup:**
- `/setup` shows "Already configured" message
- New users can ONLY register via invite link from admin
- Admin manages users at `/admin/users`

---

## File Size Considerations

| Content | Typical Size | Storage Strategy |
|---------|--------------|------------------|
| Simple drawing | 10-50 KB | JSON in TEXT column |
| Complex drawing | 100-500 KB | JSON in TEXT column |
| With images | 1-10 MB+ | Images in separate table |
| Thumbnail | 10-50 KB | Base64 in drawings table |

SQLite TEXT columns can store up to 1GB. For drawings >10MB, consider:
- Storing files on disk with path references
- S3/MinIO for image storage
- Compression (gzip the JSON)
