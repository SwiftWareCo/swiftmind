# Chat Sessions & Message Persistence — Context-Aware Conversational Interface

Short, high-signal reference for the persistent chat feature with session management, message history, and context-aware follow-up questions.

## Overview
- Persistent chat sessions with tabbed interface (Chrome-style tabs above chat title)
- Context-aware follow-ups within sessions using query decontextualization
- Per-message citation dialogs with full source text and relevance scores
- Auto-session creation on first ask with automatic title generation
- Session management: create, rename, delete (hard delete with message cascade)
- Real-time UI updates via TanStack Query without manual refresh

## Data Model
- `chat_sessions(id, tenant_id, created_by, title, last_message_at, created_at, updated_at, deleted_at)`
- `chat_messages(id, tenant_id, session_id, author_user_id, role, content, citations, created_at)`
- Tenant-scoped with RLS policies enforcing membership requirements
- Soft delete support (hidden from queries) with hard delete option
- Auto-title generation from first user message (60 char limit)

## Context Behavior
- **Within session**: Follow-up questions inherit context from last 3 Q/A pairs
- **Cross-session**: No context carryover between different sessions
- **Query rewriting**: Pronouns like "his role" → "What is Ahmed's role?" using conversation history
- **Guardrails**: Query-quality gate prevents retrieval for trivial inputs (< 3 content tokens)

## Server Layer
- **Data**: `server/chat/chat.data.ts`
  - `listSessions(tenantId)`: Get sessions ordered by last_message_at
  - `getMessages(sessionId)`: Get full transcript for a session
  - `getRecentMessagesForContext(sessionId, maxMessages)`: Get recent turns for context

- **Actions**: `server/chat/chat.actions.ts`
  - `createSessionAction(tenantId, title?)`: Create new session
  - `renameSessionAction(tenantId, sessionId, title)`: Update session title
  - `askInSessionAction(tenantId, sessionId, question)`: Context-aware ask with message persistence
  - Hard delete via RPC: `hard_delete_chat_session(tenantId, sessionId)`

## UI Components
- **SessionTabs**: Horizontal scrollable tab strip with create (+), rename (✎), delete (×)
  - Uses shadcn `Tabs`, `Dialog`, `ConfirmDialog` for interactions
  - Toast notifications for all CRUD operations
  - Loading states on all database interactions

- **ChatRoot**: Main chat interface with message rendering and composer
  - Smooth auto-scroll to latest message and typing dots
  - Uses shadcn `ScrollArea` for message list overflow
  - Session-aware: ensures session exists before sending

- **MessageList**: Renders user/assistant messages with timestamps
  - Per-message citations as clickable [1], [2], etc. buttons
  - Each citation opens `SourceDialog` with full source details

- **SourceDialog**: Modal showing complete citation information
  - Full snippet text, relevance percentage, document title
  - External source links open in new tabs
  - Better UX than sidebar-only sources

- **ChatComposer**: Auto-growing textarea with send button
  - ChatGPT-style: auto-resize (max 200px), circular arrow-up send button
  - Horizontal text wrap, no scroll; max-width container prevents page overflow

## Query Rewriting & Context
```typescript
// Example context flow:
// User: "Tell me about Ahmed"
// Assistant: "Ahmed is a senior developer..."
// User: "What's his role?" 
// → Rewritten: "What is Ahmed's role? Context: User asked about Ahmed, Assistant described him as senior developer"
```

- Uses last 3 Q/A pairs to build context window for ambiguous follow-ups
- Applies same retrieval guardrails as standalone questions
- Only rewrites when query has sufficient content tokens (≥3 non-stopwords)

## Session Management
- **Auto-creation**: First question without active session creates one automatically
- **Title generation**: First user message becomes session title (auto-truncated to 60 chars)
- **Tab switching**: Loads full message history via TanStack Query
- **Hard delete**: Removes session and all messages via FK cascade
- **Real-time updates**: All operations invalidate relevant TanStack Query keys

## Citations & Sources
- **Per-message persistence**: Each assistant message stores its own citations
- **Dialog access**: Click any [1], [2] citation to see full source details
- **Persistent after refresh**: Citations hydrate from database on page load
- **Relevance scoring**: Shows percentage in dialog with source snippet
- **External links**: Direct access to source documents when available

## Technical Implementation
- **TanStack Query**: All data fetching and cache invalidation
- **Supabase RLS**: Tenant membership enforcement on all tables
- **Server actions**: All mutations go through server actions (no route handlers)
- **Real-time updates**: Query invalidation triggers immediate UI refresh
- **TypeScript**: Strict typing for all data flows and components

## SQL & RLS
```sql
-- Session policies ensure tenant membership
CREATE POLICY "chat_sessions_select" ON chat_sessions FOR SELECT 
USING (deleted_at IS NULL AND user_is_tenant_member(tenant_id));

-- Messages visible only if session not soft-deleted
CREATE POLICY "chat_messages_select" ON chat_messages FOR SELECT
USING (session_not_deleted(session_id, tenant_id) AND user_is_tenant_member(tenant_id));

-- Hard delete RPC for proper cleanup
CREATE FUNCTION hard_delete_chat_session(t uuid, s uuid) RETURNS void
SECURITY DEFINER AS $$ ... $$;
```

## Environment Variables
- `RETRIEVAL_MIN_CONTENT_TOKENS=3`: Minimum tokens for retrieval trigger
- Standard OpenAI and Supabase configuration for embeddings and storage

## User Experience
- **First ask**: Shows typing dots immediately, creates session, updates title without refresh
- **Context flow**: "Ahmed" → "his role" works within same session
- **Session switching**: Instant load of full conversation history
- **Citation access**: Any message's sources viewable via dialog
- **Mobile responsive**: Tab strip scrolls horizontally, composer adapts

## Acceptance Criteria
- ✅ New conversation creates a session; messages persist
- ✅ Switching sessions loads complete history
- ✅ Delete removes session and all messages
- ✅ Follow-ups resolve pronouns within same session
- ✅ No context carryover between different sessions
- ✅ RLS enforced on all operations
- ✅ Real-time UI updates without manual refresh
- ✅ Citations accessible for any message, not just latest

## Manual Test Plan
1. **First ask**: Create new session → type question → verify typing dots, session creation, title update
2. **Context flow**: Ask "about Ahmed" → then "his role" → verify pronoun resolution
3. **Session switching**: Create multiple sessions → switch between → verify history loads
4. **Citations**: Ask question with sources → click [1], [2] → verify dialog shows full details
5. **Persistence**: Refresh page → verify sessions and messages persist
6. **Cross-session**: Switch sessions → ask follow-up → verify no context bleed
7. **Management**: Rename/delete sessions → verify toasts and UI updates

## Dependencies
- TanStack Query for state management and caching
- Supabase for database operations and RLS
- shadcn/ui components: Tabs, Dialog, ScrollArea, Button, Input
- Lucide React for icons (ArrowUp in composer)
- OpenAI for query rewriting context and retrieval
