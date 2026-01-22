# Feature Ideas for Excalidraw Self-Hosted

Based on codebase analysis - current app has authentication, folder organization, and admin features.

## Collaboration Features
- **Real-time collaboration** - WebSocket-based multi-user editing on the same canvas
- **Drawing sharing** - Public/private links with optional password protection
- **Comments/annotations** - Add discussion threads to specific areas of drawings
- **Cursor presence** - Show other users' cursors in real-time
- **Version history** - Track changes with ability to restore previous versions

## Export & Import
- **Export formats** - PNG, SVG, PDF, JSON export options
- **Batch export** - Export entire folders as ZIP
- **Import drawings** - Import from `.excalidraw` files or images
- **Template library** - Pre-made templates for diagrams, flowcharts, wireframes

## Organization & Search
- **Tags/labels** - Categorize drawings with color-coded tags
- **Full-text search** - Search drawing contents (text elements)
- **Favorites/starred** - Quick access to frequently used drawings
- **Recent drawings** - Dashboard widget for recently edited items
- **Trash/recycle bin** - Soft delete with recovery option

## User Experience
- **Dark mode** - System-wide theme toggle
- **Dashboard view** - Grid/thumbnail view of all drawings
- **Keyboard shortcuts** - Quick navigation between drawings
- **Drawing preview** - Hover preview in sidebar
- **Offline support** - PWA with service worker for offline editing

## Authentication & Security
- **OAuth providers** - Google, GitHub, Microsoft login (Better Auth supports this)
- **Two-factor authentication (2FA)**
- **API tokens** - For programmatic access
- **Audit logs** - Track who accessed/modified what
- **Session management** - View/revoke active sessions

## Team Features
- **Workspaces/Teams** - Shared folders for team collaboration
- **Permissions** - Viewer/editor/admin per folder or drawing
- **Team dashboard** - See all team activity
- **Drawing assignments** - Assign drawings to team members

## Integration & API
- **REST API** - Public API for integrations
- **Webhooks** - Notify external services on drawing changes
- **Embed support** - Embed drawings in other sites (iframe)
- **Notion/Confluence export** - Direct publishing
- **S3/cloud storage** - Optional external file storage

## Advanced Canvas Features
- **Custom libraries** - Save/share element libraries
- **Sticky notes mode** - Brainstorming view
- **Presentation mode** - Slide-by-slide navigation
- **Drawing lock** - Prevent accidental edits
- **Grid/ruler overlays** - Precision drawing aids

## Admin & Analytics
- **Usage analytics** - Track active users, popular drawings
- **Storage quotas** - Per-user storage limits
- **Bulk user import** - CSV user creation
- **Custom branding** - Logo, colors, domain
- **Backup/restore** - Scheduled database backups

## Quick Wins (Lower Effort)
1. **Duplicate drawing** - Copy existing drawing
2. **Move to folder** dialog
3. **Breadcrumb navigation** in canvas view
4. **Drawing description/notes**
5. **Sort options** - By name, date, size
6. **Empty state illustrations** for new users
