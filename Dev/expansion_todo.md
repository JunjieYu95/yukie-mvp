# Yukie Assistant Expansion TODO

**Version:** 1.0  
**Date:** January 25, 2026  
**Status:** Planning Phase

---

## Table of Contents

1. [Protocol Migration: YWAIP → MCP](#1-protocol-migration-ywaip--mcp)
2. [Voice-to-Text Integration](#2-voice-to-text-integration)
3. [UI/UX Enhancements](#3-uiux-enhancements)
4. [Legacy App Integration](#4-legacy-app-integration)
5. [Infrastructure & DevOps](#5-infrastructure--devops)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Testing & Quality Assurance](#7-testing--quality-assurance)

---

## 1. Protocol Migration: YWAIP → MCP

### Overview
Migrate from custom YWAIP protocol to standard MCP (Model Context Protocol) to leverage bidirectional communication, artifact support (images, files, etc.), and industry-standard tooling.

### 1.1 Research & Planning

- [ ] **Study MCP Specification**
  - [ ] Review official MCP documentation: https://modelcontextprotocol.io
  - [ ] Understand MCP transport protocols (stdio, HTTP, WebSocket, SSE)
  - [ ] Study MCP message types: `initialize`, `tools/list`, `tools/call`, `prompts/list`, `resources/list`, `sampling/create`
  - [ ] Understand artifact handling (images, files, structured data)
  - [ ] Review MCP server/client patterns and best practices

- [ ] **Architecture Design**
  - [ ] Design MCP server wrapper for existing services
  - [ ] Plan bidirectional communication flow (server → client notifications)
  - [ ] Design artifact handling architecture (storage, retrieval, display)
  - [ ] Plan migration strategy (gradual vs. big bang)
  - [ ] Design backward compatibility layer (if needed)

- [ ] **Impact Analysis**
  - [ ] Audit all existing services using YWAIP (`habit-tracker`, etc.)
  - [ ] List all YWAIP endpoints (`/v1/meta`, `/v1/actions`, `/v1/invoke`)
  - [ ] Map YWAIP concepts to MCP equivalents
  - [ ] Identify breaking changes
  - [ ] Document migration path for each service

### 1.2 Core MCP Implementation

- [ ] **MCP Server Library**
  - [ ] Create `packages/shared/mcp-server/` package
  - [ ] Implement MCP protocol message handlers
  - [ ] Implement transport layer abstraction (HTTP, WebSocket, SSE)
  - [ ] Implement tool discovery (`tools/list`)
  - [ ] Implement tool invocation (`tools/call`)
  - [ ] Implement resource discovery (`resources/list`)
  - [ ] Implement prompt templates (`prompts/list`)
  - [ ] Implement artifact handling (upload, download, display)
  - [ ] Add JSON Schema validation for tool parameters
  - [ ] Add error handling and error codes per MCP spec

- [ ] **MCP Client Library**
  - [ ] Create `packages/shared/mcp-client/` package
  - [ ] Implement MCP client for Yukie core
  - [ ] Implement connection management (connect, disconnect, reconnect)
  - [ ] Implement tool discovery and caching
  - [ ] Implement tool invocation with retries
  - [ ] Implement resource fetching
  - [ ] Implement artifact handling (receive, display)
  - [ ] Implement bidirectional message handling (server notifications)

- [ ] **MCP Registry**
  - [ ] Refactor `packages/yukie-core/src/registry.ts` to use MCP
  - [ ] Replace YWAIP endpoints with MCP protocol
  - [ ] Update service discovery to use MCP `initialize` handshake
  - [ ] Update tool registry to use MCP `tools/list`
  - [ ] Add MCP transport configuration (HTTP, WebSocket, SSE)
  - [ ] Add MCP connection pooling and health checks

### 1.3 Service Migration

- [ ] **Migrate Habit Tracker Service**
  - [ ] Convert `packages/services/habit-tracker/` to MCP server
  - [ ] Replace YWAIP endpoints with MCP handlers
  - [ ] Update tool definitions to MCP format
  - [ ] Add artifact support (e.g., habit streak charts as images)
  - [ ] Test MCP client connection
  - [ ] Update service registry configuration

- [ ] **Migrate Activity Log Service**
  - [ ] Convert `packages/services/activity-log-service/` to MCP server
  - [ ] Replace YWAIP endpoints with MCP handlers
  - [ ] Add artifact support (e.g., activity timeline visualizations)
  - [ ] Test MCP client connection

- [ ] **Migrate YouTube Analyzer Service**
  - [ ] Convert `packages/services/youtube-analyzer/` to MCP server
  - [ ] Replace YWAIP endpoints with MCP handlers
  - [ ] Add artifact support (e.g., video thumbnails, analysis charts)
  - [ ] Test MCP client connection

### 1.4 Yukie Core Updates

- [ ] **Router Updates**
  - [ ] Update `packages/yukie-core/src/router.ts` to use MCP client
  - [ ] Replace YWAIP tool calls with MCP `tools/call`
  - [ ] Update tool discovery to use MCP `tools/list`
  - [ ] Add artifact handling in responses
  - [ ] Update error handling for MCP error codes

- [ ] **Planner Updates**
  - [ ] Update `packages/yukie-core/src/planner/planner.ts` for MCP tools
  - [ ] Support artifact generation in plans
  - [ ] Handle bidirectional MCP notifications

- [ ] **Executor Updates**
  - [ ] Update `packages/yukie-core/src/executor/executor.ts` for MCP calls
  - [ ] Add artifact validation and handling
  - [ ] Support streaming responses (if using SSE)

- [ ] **Composer Updates**
  - [ ] Update `packages/yukie-core/src/composer/composer.ts` to handle artifacts
  - [ ] Add artifact rendering in natural language responses
  - [ ] Support multi-artifact responses

### 1.5 API Updates

- [ ] **Chat API**
  - [ ] Update `api/chat.ts` to use MCP-based routing
  - [ ] Add artifact support in response format
  - [ ] Add streaming support (SSE) for long-running operations
  - [ ] Update error responses to MCP error format

- [ ] **New MCP Endpoints**
  - [ ] Create `api/mcp/connect.ts` for MCP server connections
  - [ ] Create `api/mcp/tools.ts` for tool discovery
  - [ ] Create `api/mcp/invoke.ts` for tool invocation
  - [ ] Create `api/mcp/artifacts/[id].ts` for artifact retrieval

### 1.6 Documentation

- [ ] **Migration Guide**
  - [ ] Document YWAIP → MCP migration steps
  - [ ] Create service migration checklist
  - [ ] Document breaking changes
  - [ ] Create MCP service development guide

- [ ] **MCP Protocol Documentation**
  - [ ] Document MCP server implementation patterns
  - [ ] Document MCP client usage
  - [ ] Document artifact handling patterns
  - [ ] Create MCP service examples

---

## 2. Voice-to-Text Integration

### Overview
Integrate OpenAI Whisper API for voice-to-text functionality, enabling users to speak to Yukie instead of typing.

### 2.1 Research & Setup

- [ ] **Whisper API Research**
  - [ ] Review OpenAI Whisper API documentation
  - [ ] Understand API endpoints, rate limits, pricing
  - [ ] Review supported audio formats and requirements
  - [ ] Study best practices for audio preprocessing
  - [ ] Research alternatives (local Whisper, other APIs)

- [ ] **Audio Processing Research**
  - [ ] Research browser audio APIs (MediaRecorder, Web Audio API)
  - [ ] Understand audio format conversion (WAV, MP3, WebM, etc.)
  - [ ] Research audio compression and optimization
  - [ ] Study real-time vs. batch transcription patterns

### 2.2 Backend Implementation

- [ ] **Whisper API Integration**
  - [ ] Create `api/transcribe.ts` endpoint
  - [ ] Implement OpenAI Whisper API client
  - [ ] Add audio file upload handling (multipart/form-data)
  - [ ] Implement audio format validation
  - [ ] Add audio preprocessing (if needed)
  - [ ] Implement transcription with error handling
  - [ ] Add rate limiting and quota management
  - [ ] Add caching for repeated transcriptions (optional)

- [ ] **Audio Storage**
  - [ ] Design audio file storage strategy (temporary vs. permanent)
  - [ ] Implement temporary file cleanup (auto-delete after transcription)
  - [ ] Add audio file size limits and validation
  - [ ] Consider cloud storage for large files (if needed)

- [ ] **API Security**
  - [ ] Add authentication to transcription endpoint
  - [ ] Add scope checking (`yukie:voice` or similar)
  - [ ] Add file size and duration limits
  - [ ] Add content validation (ensure it's audio)

### 2.3 Frontend Implementation

- [ ] **Audio Recording Component**
  - [ ] Create `apps/chatbox/src/components/VoiceRecorder.vue`
  - [ ] Implement browser MediaRecorder API
  - [ ] Add recording controls (start, stop, pause, resume)
  - [ ] Add visual feedback (waveform, recording indicator)
  - [ ] Add recording duration display
  - [ ] Handle browser permissions (microphone access)
  - [ ] Add error handling for unsupported browsers

- [ ] **Audio Upload & Transcription**
  - [ ] Implement audio file upload to `/api/transcribe`
  - [ ] Add upload progress indicator
  - [ ] Display transcription status (uploading, transcribing, complete)
  - [ ] Handle transcription errors gracefully
  - [ ] Auto-populate chat input with transcription
  - [ ] Add option to edit transcription before sending

- [ ] **UI Integration**
  - [ ] Add microphone button to `InputBar.vue`
  - [ ] Add voice recording UI overlay/modal
  - [ ] Add visual recording indicator in header/input area
  - [ ] Add keyboard shortcut for voice recording (optional)
  - [ ] Make voice recording accessible (ARIA labels, keyboard navigation)

- [ ] **Real-time Transcription (Optional)**
  - [ ] Research real-time transcription options (WebSocket streaming)
  - [ ] Implement streaming transcription if feasible
  - [ ] Add live transcription display during recording

### 2.4 User Experience Enhancements

- [ ] **Voice Feedback**
  - [ ] Add audio feedback for recording start/stop
  - [ ] Add haptic feedback (if on mobile)
  - [ ] Add visual animations during recording

- [ ] **Transcription Quality**
  - [ ] Add transcription confidence scores (if available from API)
  - [ ] Highlight uncertain words/phrases
  - [ ] Add option to re-transcribe with different settings

- [ ] **Settings**
  - [ ] Add voice recording settings to `stores/settings.ts`
  - [ ] Add audio quality settings (sample rate, bitrate)
  - [ ] Add auto-send after transcription option
  - [ ] Add language selection (if Whisper supports it)

### 2.5 Testing

- [ ] **Unit Tests**
  - [ ] Test audio recording component
  - [ ] Test transcription API endpoint
  - [ ] Test audio format conversion
  - [ ] Test error handling

- [ ] **Integration Tests**
  - [ ] Test end-to-end voice → transcription → chat flow
  - [ ] Test with different audio formats
  - [ ] Test with different languages (if supported)
  - [ ] Test error scenarios (API failures, network issues)

- [ ] **Manual Testing**
  - [ ] Test on different browsers (Chrome, Firefox, Safari, Edge)
  - [ ] Test on mobile devices (iOS Safari, Android Chrome)
  - [ ] Test with different microphone qualities
  - [ ] Test with background noise
  - [ ] Test with different accents/languages

---

## 3. UI/UX Enhancements

### Overview
Transform Yukie into a modern, responsive messenger-style app with PWA support, multiple contacts, and asynchronous messaging.

### 3.1 Responsive Design & PWA

- [ ] **Responsive Layout**
  - [ ] Audit current UI for mobile responsiveness
  - [ ] Implement mobile-first CSS approach
  - [ ] Add breakpoints for tablet and mobile
  - [ ] Optimize touch targets (min 44x44px)
  - [ ] Test on various screen sizes (320px to 4K)

- [ ] **Mobile Navigation**
  - [ ] Design mobile navigation pattern (hamburger menu, bottom nav, etc.)
  - [ ] Implement responsive sidebar (overlay on mobile, side panel on desktop)
  - [ ] Add swipe gestures for navigation (optional)
  - [ ] Optimize header for mobile (compact design)

- [ ] **PWA Setup**
  - [ ] Create `apps/chatbox/public/manifest.json`
  - [ ] Add app icons (192x192, 512x512, favicon)
  - [ ] Configure service worker (`apps/chatbox/public/sw.js`)
  - [ ] Implement offline support (cache static assets, API responses)
  - [ ] Add "Add to Home Screen" prompt
  - [ ] Configure app name, short name, theme color
  - [ ] Add splash screens for iOS/Android

- [ ] **Service Worker**
  - [ ] Implement caching strategy (cache-first, network-first, stale-while-revalidate)
  - [ ] Cache API responses for offline access
  - [ ] Implement background sync for failed requests
  - [ ] Add push notification support (for async messages)
  - [ ] Handle service worker updates

- [ ] **Mobile Optimizations**
  - [ ] Optimize font sizes for mobile readability
  - [ ] Add safe area insets for notched devices
  - [ ] Optimize images and assets for mobile
  - [ ] Add pull-to-refresh (optional)
  - [ ] Optimize scrolling performance

### 3.2 Messenger-Style Layout

- [ ] **Contact List Design**
  - [ ] Create `apps/chatbox/src/components/ContactList.vue`
  - [ ] Design contact card/item component
  - [ ] Add contact avatars (with fallback initials/colors)
  - [ ] Add contact names and status indicators
  - [ ] Add last message preview
  - [ ] Add timestamp display (relative: "2m ago", absolute: "Jan 25")
  - [ ] Add unread badge (red dot with count)
  - [ ] Add search/filter contacts functionality
  - [ ] Add contact sorting (by last message time, alphabetically)

- [ ] **Contact Management**
  - [ ] Create contact data model/types
  - [ ] Create `stores/contacts.ts` store
  - [ ] Implement contact CRUD operations
  - [ ] Add contact categories/groups (Yukie, MCP Services, etc.)
  - [ ] Add contact favorites/pinning
  - [ ] Add contact settings (mute, archive, delete)

- [ ] **Chat Thread View**
  - [ ] Refactor `ChatWindow.vue` to support multiple threads
  - [ ] Add thread/conversation switching
  - [ ] Update URL routing to include thread ID (`/chat/:threadId`)
  - [ ] Add thread header with contact info
  - [ ] Add thread actions (info, mute, archive, delete)
  - [ ] Persist thread state (scroll position, etc.)

- [ ] **Main Page Layout**
  - [ ] Create `apps/chatbox/src/components/MainLayout.vue`
  - [ ] Design three-panel layout: ContactList | ChatWindow | (optional) DetailsPanel
  - [ ] Implement responsive layout (stack on mobile, side-by-side on desktop)
  - [ ] Add smooth transitions between views
  - [ ] Add empty state when no contact selected

### 3.3 Multiple Contacts & MCP Integration

- [ ] **Yukie Master Manager**
  - [ ] Design Yukie as primary/default contact
  - [ ] Add special styling/branding for Yukie contact
  - [ ] Ensure Yukie handles all general queries

- [ ] **MCP Service Contacts**
  - [ ] Design MCP service as contacts pattern
  - [ ] Auto-create contacts for registered MCP services
  - [ ] Add MCP service metadata to contacts (icon, description, capabilities)
  - [ ] Implement direct MCP service chat (bypass Yukie routing)
  - [ ] Add MCP service status indicators (online, offline, error)

- [ ] **Contact Registration**
  - [ ] Create UI for adding new MCP services
  - [ ] Add MCP service connection form (URL, auth, etc.)
  - [ ] Add manual contact creation (for non-MCP services)
  - [ ] Add contact import/export (optional)

- [ ] **Service Discovery UI**
  - [ ] Create MCP service discovery/browser UI
  - [ ] Display available MCP services with descriptions
  - [ ] Add "Add Service" button/flow
  - [ ] Show service capabilities/tools before adding

### 3.4 Asynchronous Messaging

- [ ] **Message Queue System**
  - [ ] Design message queue architecture
  - [ ] Create `api/messages/queue.ts` for queuing messages
  - [ ] Implement message status tracking (pending, processing, completed, failed)
  - [ ] Add message retry logic
  - [ ] Store messages in database (or in-memory cache initially)

- [ ] **Background Processing**
  - [ ] Implement background job processing (Vercel Background Functions, or external service)
  - [ ] Process queued messages asynchronously
  - [ ] Update message status in real-time
  - [ ] Handle long-running operations (streaming, polling)

- [ ] **Notification System**
  - [ ] Create `api/notifications/` endpoints
  - [ ] Implement WebSocket or SSE for real-time notifications
  - [ ] Add notification when message response is ready
  - [ ] Add notification when new message arrives
  - [ ] Implement notification preferences per contact

- [ ] **Unread Badge System**
  - [ ] Create unread message tracking
  - [ ] Add unread count to contact list items
  - [ ] Add red dot indicator on contact avatars
  - [ ] Update unread count in real-time
  - [ ] Mark messages as read when thread is opened
  - [ ] Persist unread state across sessions

- [ ] **Frontend Async Handling**
  - [ ] Update `stores/chat.ts` for async messaging
  - [ ] Add message status indicators (sending, sent, delivered, read)
  - [ ] Add "Return to main page" button after sending
  - [ ] Implement polling or WebSocket for status updates
  - [ ] Show notification when response is ready
  - [ ] Auto-navigate to thread when response arrives (optional)

- [ ] **Message History**
  - [ ] Implement message persistence
  - [ ] Load message history per thread
  - [ ] Add pagination for long conversations
  - [ ] Add message search functionality

### 3.5 UI Components & Polish

- [ ] **Message Bubbles**
  - [ ] Enhance `MessageBubble.vue` for messenger style
  - [ ] Add message timestamps (hover to show)
  - [ ] Add message status indicators (sent, delivered, read)
  - [ ] Add message reactions (optional)
  - [ ] Add message actions (copy, delete, edit)
  - [ ] Add typing indicators

- [ ] **Input Bar Enhancements**
  - [ ] Enhance `InputBar.vue` for messenger style
  - [ ] Add emoji picker
  - [ ] Add file attachment button
  - [ ] Add voice recording button (from Section 2)
  - [ ] Add send button styling
  - [ ] Add character count (optional)
  - [ ] Add input auto-resize

- [ ] **Animations & Transitions**
  - [ ] Add smooth page transitions
  - [ ] Add message send/receive animations
  - [ ] Add loading skeletons
  - [ ] Add micro-interactions (button presses, hovers)

- [ ] **Theme & Styling**
  - [ ] Implement dark mode (optional)
  - [ ] Add theme customization
  - [ ] Ensure consistent color scheme
  - [ ] Add custom fonts (if desired)

### 3.6 Testing

- [ ] **Responsive Testing**
  - [ ] Test on various devices (iPhone, Android, iPad, desktop)
  - [ ] Test on various browsers
  - [ ] Test PWA installation and offline mode
  - [ ] Test touch interactions

- [ ] **Async Messaging Testing**
  - [ ] Test message queuing and processing
  - [ ] Test notification delivery
  - [ ] Test unread badge updates
  - [ ] Test concurrent conversations

---

## 4. Legacy App Integration

### Overview
Upgrade existing apps (DiaryAnalyzer, ideas_log, workstyle) to be accessible via Yukie by implementing MCP servers for each.

### 4.1 DiaryAnalyzer Integration

- [ ] **App Analysis**
  - [ ] Review DiaryAnalyzer codebase structure
  - [ ] Identify core functionality and data models
  - [ ] List existing APIs/endpoints
  - [ ] Document data access patterns

- [ ] **MCP Server Implementation**
  - [ ] Create `packages/services/diary-analyzer/` package
  - [ ] Implement MCP server wrapper
  - [ ] Define MCP tools for diary operations:
    - [ ] `analyze_entry` - Analyze a diary entry
    - [ ] `get_insights` - Get insights from diary entries
    - [ ] `search_entries` - Search diary entries
    - [ ] `create_entry` - Create new diary entry
    - [ ] `update_entry` - Update existing entry
    - [ ] `get_entry` - Get specific entry
    - [ ] `get_statistics` - Get diary statistics
  - [ ] Implement tool handlers
  - [ ] Add authentication/authorization
  - [ ] Add error handling

- [ ] **Data Migration**
  - [ ] Plan data migration strategy (if needed)
  - [ ] Ensure data compatibility
  - [ ] Add data validation

- [ ] **Testing**
  - [ ] Test MCP server connection
  - [ ] Test all tool invocations
  - [ ] Test error scenarios
  - [ ] Test with Yukie integration

### 4.2 Ideas Log Integration

- [ ] **App Analysis**
  - [ ] Review ideas_log codebase structure
  - [ ] Identify core functionality and data models
  - [ ] List existing APIs/endpoints
  - [ ] Document data access patterns

- [ ] **MCP Server Implementation**
  - [ ] Create `packages/services/ideas-log/` package
  - [ ] Implement MCP server wrapper
  - [ ] Define MCP tools for ideas operations:
    - [ ] `create_idea` - Create new idea
    - [ ] `update_idea` - Update existing idea
    - [ ] `get_idea` - Get specific idea
    - [ ] `list_ideas` - List ideas with filters
    - [ ] `search_ideas` - Search ideas
    - [ ] `tag_idea` - Add tags to idea
    - [ ] `archive_idea` - Archive idea
    - [ ] `get_statistics` - Get ideas statistics
  - [ ] Implement tool handlers
  - [ ] Add authentication/authorization
  - [ ] Add error handling

- [ ] **Data Migration**
  - [ ] Plan data migration strategy (if needed)
  - [ ] Ensure data compatibility
  - [ ] Add data validation

- [ ] **Testing**
  - [ ] Test MCP server connection
  - [ ] Test all tool invocations
  - [ ] Test error scenarios
  - [ ] Test with Yukie integration

### 4.3 Workstyle Integration

- [ ] **App Analysis**
  - [ ] Review workstyle codebase structure
  - [ ] Identify core functionality and data models
  - [ ] List existing APIs/endpoints
  - [ ] Document data access patterns
  - [ ] Note: This appears to be Python-based, may need different approach

- [ ] **MCP Server Implementation**
  - [ ] Create `packages/services/workstyle/` package
  - [ ] Decide on implementation approach:
    - [ ] Option A: Rewrite in TypeScript/Node.js
    - [ ] Option B: Create MCP wrapper around Python service (HTTP proxy)
    - [ ] Option C: Use Python MCP server library
  - [ ] Define MCP tools for workstyle operations:
    - [ ] `add_entry` - Add work entry
    - [ ] `update_entry` - Update work entry
    - [ ] `get_entry` - Get specific entry
    - [ ] `list_entries` - List entries with filters
    - [ ] `get_statistics` - Get work statistics
    - [ ] `chat` - Chat with workstyle assistant (if exists)
  - [ ] Implement tool handlers
  - [ ] Add authentication/authorization
  - [ ] Add error handling

- [ ] **Data Migration**
  - [ ] Plan data migration strategy (if needed)
  - [ ] Ensure data compatibility
  - [ ] Add data validation

- [ ] **Testing**
  - [ ] Test MCP server connection
  - [ ] Test all tool invocations
  - [ ] Test error scenarios
  - [ ] Test with Yukie integration

### 4.4 Service Registry Updates

- [ ] **Registry Configuration**
  - [ ] Add DiaryAnalyzer to `config/registry.yaml`
  - [ ] Add ideas_log to `config/registry.yaml`
  - [ ] Add workstyle to `config/registry.yaml`
  - [ ] Configure service metadata (name, description, icon)
  - [ ] Configure authentication/authorization
  - [ ] Add service tags/categories

- [ ] **Yukie Integration**
  - [ ] Test service discovery
  - [ ] Test routing to new services
  - [ ] Test tool invocation
  - [ ] Add service-specific prompts/instructions

### 4.5 Documentation

- [ ] **Service Documentation**
  - [ ] Document each service's capabilities
  - [ ] Document tool parameters and responses
  - [ ] Create usage examples
  - [ ] Document authentication requirements

---

## 5. Infrastructure & DevOps

### Overview
Support the expanded Yukie system with proper infrastructure, monitoring, and deployment.

### 5.1 Database & Storage

- [ ] **Message Storage**
  - [ ] Design database schema for messages
  - [ ] Choose database (PostgreSQL, MongoDB, etc.)
  - [ ] Implement message persistence
  - [ ] Add message indexing for search
  - [ ] Plan data retention policies

- [ ] **Contact Storage**
  - [ ] Design database schema for contacts
  - [ ] Implement contact persistence
  - [ ] Add contact indexing

- [ ] **Artifact Storage**
  - [ ] Design artifact storage strategy (S3, Cloudinary, etc.)
  - [ ] Implement artifact upload/download
  - [ ] Add artifact metadata storage
  - [ ] Plan artifact cleanup/retention

- [ ] **Audio Storage**
  - [ ] Design audio file storage (temporary)
  - [ ] Implement audio cleanup jobs
  - [ ] Add storage quotas/limits

### 5.2 Real-time Communication

- [ ] **WebSocket/SSE Setup**
  - [ ] Choose real-time solution (WebSocket, SSE, Pusher, etc.)
  - [ ] Implement WebSocket/SSE server
  - [ ] Add connection management
  - [ ] Add reconnection logic
  - [ ] Add message queuing for offline clients

- [ ] **Push Notifications**
  - [ ] Set up push notification service (Firebase, OneSignal, etc.)
  - [ ] Implement push notification sending
  - [ ] Add notification preferences
  - [ ] Test on iOS and Android

### 5.3 Background Jobs

- [ ] **Job Queue System**
  - [ ] Choose job queue (Bull, BullMQ, Vercel Background Functions, etc.)
  - [ ] Implement message processing jobs
  - [ ] Add job retry logic
  - [ ] Add job monitoring/dashboard

- [ ] **Scheduled Jobs**
  - [ ] Implement cleanup jobs (old messages, artifacts, audio)
  - [ ] Implement health check jobs
  - [ ] Add cron job scheduling

### 5.4 Monitoring & Observability

- [ ] **Logging**
  - [ ] Enhance logging with structured logs
  - [ ] Add log aggregation (Datadog, Logtail, etc.)
  - [ ] Add log levels and filtering
  - [ ] Add request tracing

- [ ] **Metrics**
  - [ ] Add performance metrics (response time, throughput)
  - [ ] Add business metrics (messages sent, services used)
  - [ ] Add error rates and alerts
  - [ ] Set up monitoring dashboard

- [ ] **Error Tracking**
  - [ ] Set up error tracking (Sentry, Rollbar, etc.)
  - [ ] Add error alerting
  - [ ] Add error context and stack traces

### 5.5 Security

- [ ] **Authentication & Authorization**
  - [ ] See [Section 6: Authentication & Authorization](#6-authentication--authorization) for detailed auth implementation
  - [ ] Add rate limiting per user/service
  - [ ] Add API key management for services

- [ ] **Data Security**
  - [ ] Add encryption at rest for sensitive data
  - [ ] Add encryption in transit (TLS)
  - [ ] Add data access auditing
  - [ ] Review and fix security vulnerabilities

- [ ] **Input Validation**
  - [ ] Enhance input validation across all endpoints
  - [ ] Add sanitization for user inputs
  - [ ] Add file upload validation
  - [ ] Add audio file validation

### 5.6 Deployment

- [ ] **Vercel Configuration**
  - [ ] Update `vercel.json` for new endpoints
  - [ ] Configure environment variables
  - [ ] Set up preview deployments
  - [ ] Configure production deployments

- [ ] **CI/CD**
  - [ ] Set up GitHub Actions (or similar)
  - [ ] Add automated testing
  - [ ] Add automated deployment
  - [ ] Add deployment notifications

- [ ] **Environment Management**
  - [ ] Set up development environment
  - [ ] Set up staging environment
  - [ ] Set up production environment
  - [ ] Manage environment variables securely

---

## 6. Authentication & Authorization

### Overview
Replace dev authentication with a production-ready, multi-user authentication system. Implement two-layer authentication: Yukie-level authentication for user access, and service-level authentication for MCP services. Design for easy onboarding while maintaining security and data isolation.

### 6.1 Architecture Design

- [ ] **Authentication Strategy**
  - [ ] Research authentication patterns (JWT, sessions, OAuth, etc.)
  - [ ] Choose primary auth method (recommended: JWT with refresh tokens)
  - [ ] Design user registration flow
  - [ ] Design login flow
  - [ ] Design password reset flow
  - [ ] Design account management flow
  - [ ] Plan for easy onboarding (guest mode, quick signup, etc.)

- [ ] **Two-Layer Auth Architecture**
  - [ ] Design Yukie-level authentication (user → Yukie)
  - [ ] Design service-level authentication (Yukie → MCP services)
  - [ ] Design credential storage and management
  - [ ] Design credential forwarding/passthrough mechanism
  - [ ] Plan for service-specific auth requirements (API keys, OAuth, etc.)

- [ ] **Multi-User & Data Isolation**
  - [ ] Design user data isolation strategy
  - [ ] Design tenant/user ID propagation to services
  - [ ] Plan database schema for user accounts
  - [ ] Plan user-scoped data access patterns
  - [ ] Design user management (CRUD operations)

- [ ] **Easy Onboarding Strategy**
  - [ ] Design guest/anonymous mode (optional)
  - [ ] Design quick signup flow (minimal fields)
  - [ ] Design demo/trial mode
  - [ ] Plan for self-service account creation
  - [ ] Consider social login options (Google, GitHub, etc.) for easier access

### 6.2 User Database & Schema

- [ ] **Database Design**
  - [ ] Choose database (PostgreSQL recommended for relational data)
  - [ ] Design `users` table schema:
    - [ ] `id` (UUID primary key)
    - [ ] `username` (unique, indexed)
    - [ ] `email` (unique, indexed, optional)
    - [ ] `password_hash` (bcrypt/argon2)
    - [ ] `created_at`, `updated_at`
    - [ ] `last_login_at`
    - [ ] `is_active`, `is_verified`
    - [ ] `metadata` (JSON for additional fields)
  - [ ] Design `sessions` or `refresh_tokens` table (if using refresh tokens)
  - [ ] Design `user_preferences` table (optional)
  - [ ] Add indexes for performance
  - [ ] Plan migration from dev auth to production auth

- [ ] **Password Security**
  - [ ] Choose password hashing algorithm (bcrypt, argon2, scrypt)
  - [ ] Implement password strength requirements
  - [ ] Add password reset token storage
  - [ ] Add password change functionality
  - [ ] Implement rate limiting for login attempts

### 6.3 Yukie-Level Authentication

- [ ] **User Registration**
  - [ ] Create `api/auth/register.ts` endpoint
  - [ ] Implement username validation (uniqueness, format)
  - [ ] Implement email validation (if using email)
  - [ ] Implement password validation (strength, requirements)
  - [ ] Hash passwords before storage
  - [ ] Create user account in database
  - [ ] Generate initial JWT token
  - [ ] Return success response with token
  - [ ] Add email verification flow (optional)

- [ ] **User Login**
  - [ ] Create `api/auth/login.ts` endpoint
  - [ ] Accept username/email and password
  - [ ] Verify user exists and is active
  - [ ] Verify password hash
  - [ ] Implement rate limiting (prevent brute force)
  - [ ] Generate JWT access token
  - [ ] Generate refresh token (if using refresh tokens)
  - [ ] Update `last_login_at` timestamp
  - [ ] Return tokens and user info
  - [ ] Add "Remember me" option (longer token expiry)

- [ ] **Token Management**
  - [ ] Refactor JWT generation to include user ID and scopes
  - [ ] Implement access token (short-lived, 15-60 minutes)
  - [ ] Implement refresh token (long-lived, 7-30 days, stored in DB)
  - [ ] Create `api/auth/refresh.ts` endpoint for token refresh
  - [ ] Create `api/auth/logout.ts` endpoint (invalidate refresh token)
  - [ ] Add token revocation mechanism
  - [ ] Add token blacklist (for immediate revocation)

- [ ] **Password Management**
  - [ ] Create `api/auth/forgot-password.ts` endpoint
  - [ ] Generate secure reset token
  - [ ] Send reset email (or return reset link for self-hosted)
  - [ ] Create `api/auth/reset-password.ts` endpoint
  - [ ] Validate reset token
  - [ ] Update password hash
  - [ ] Invalidate reset token after use
  - [ ] Add password change endpoint (for logged-in users)

- [ ] **Account Management**
  - [ ] Create `api/auth/me.ts` endpoint (get current user info)
  - [ ] Create `api/auth/update-profile.ts` endpoint
  - [ ] Create `api/auth/change-password.ts` endpoint
  - [ ] Add account deletion/deactivation endpoint
  - [ ] Add user preferences management

### 6.4 Service-Level Authentication

- [ ] **Service Credential Storage**
  - [ ] Design `service_credentials` table schema:
    - [ ] `id` (UUID primary key)
    - [ ] `user_id` (foreign key to users)
    - [ ] `service_id` (e.g., 'habit-tracker', 'google-calendar')
    - [ ] `credential_type` (api_key, oauth_token, username_password, etc.)
    - [ ] `encrypted_credentials` (encrypted storage)
    - [ ] `metadata` (JSON for additional config)
    - [ ] `created_at`, `updated_at`, `expires_at`
  - [ ] Implement credential encryption at rest
  - [ ] Add credential rotation support
  - [ ] Add credential validation/health checks

- [ ] **Credential Management API**
  - [ ] Create `api/auth/service-credentials.ts` endpoints:
    - [ ] `GET /api/auth/service-credentials` - List user's service credentials
    - [ ] `POST /api/auth/service-credentials` - Add service credentials
    - [ ] `PUT /api/auth/service-credentials/:id` - Update credentials
    - [ ] `DELETE /api/auth/service-credentials/:id` - Remove credentials
    - [ ] `POST /api/auth/service-credentials/:id/test` - Test credentials
  - [ ] Add credential encryption/decryption utilities
  - [ ] Add credential validation before storage
  - [ ] Implement user-scoped access (users can only access their own credentials)

- [ ] **Credential Forwarding**
  - [ ] Design credential injection mechanism for MCP service calls
  - [ ] Update MCP client to include user credentials
  - [ ] Implement credential lookup by `user_id` + `service_id`
  - [ ] Add credential refresh logic (for OAuth tokens)
  - [ ] Handle missing/invalid credentials gracefully
  - [ ] Add credential caching (in-memory, short TTL)

- [ ] **Service-Specific Auth Handlers**
  - [ ] Design auth handler interface for different auth types:
    - [ ] API key auth (simple header injection)
    - [ ] OAuth 2.0 auth (token refresh, scopes)
    - [ ] Basic auth (username/password)
    - [ ] Bearer token auth
    - [ ] Custom auth (service-specific)
  - [ ] Implement handlers for each auth type
  - [ ] Add OAuth flow support (if services require it)
  - [ ] Create UI for OAuth authorization flows

### 6.5 Frontend Authentication

- [ ] **Login/Register UI**
  - [ ] Create `apps/chatbox/src/components/LoginForm.vue`
  - [ ] Create `apps/chatbox/src/components/RegisterForm.vue`
  - [ ] Design modern, user-friendly login UI
  - [ ] Add form validation (client-side)
  - [ ] Add error handling and display
  - [ ] Add loading states
  - [ ] Add "Forgot password" link
  - [ ] Add "Remember me" checkbox
  - [ ] Add social login buttons (if implementing)

- [ ] **Auth Store Updates**
  - [ ] Update `apps/chatbox/src/stores/auth.ts`:
    - [ ] Replace `loginDev()` with `login(username, password)`
    - [ ] Add `register(username, password, email?)` method
    - [ ] Add `logout()` method (call logout endpoint)
    - [ ] Add `refreshToken()` method
    - [ ] Add `forgotPassword(email)` method
    - [ ] Add `resetPassword(token, newPassword)` method
    - [ ] Add token refresh logic (automatic before expiry)
    - [ ] Add token storage (access token + refresh token)

- [ ] **Protected Routes**
  - [ ] Implement route guards (redirect to login if not authenticated)
  - [ ] Add auth check on app initialization
  - [ ] Handle token expiry gracefully (auto-refresh or redirect to login)
  - [ ] Add "You must be logged in" messages

- [ ] **Service Credential Management UI**
  - [ ] Create `apps/chatbox/src/components/ServiceCredentials.vue`
  - [ ] Display list of configured services
  - [ ] Add "Add Service" button/form
  - [ ] Add credential input forms (API key, OAuth, etc.)
  - [ ] Add "Test Connection" button
  - [ ] Add credential edit/delete functionality
  - [ ] Show credential status (valid, expired, error)
  - [ ] Add OAuth authorization flow UI (if needed)

- [ ] **User Profile UI**
  - [ ] Create `apps/chatbox/src/components/UserProfile.vue`
  - [ ] Display user info (username, email, etc.)
  - [ ] Add profile edit form
  - [ ] Add password change form
  - [ ] Add account deletion option
  - [ ] Add logout button

### 6.6 Easy Onboarding Features

- [ ] **Guest/Anonymous Mode (Optional)**
  - [ ] Design guest user flow
  - [ ] Create temporary guest accounts
  - [ ] Limit guest functionality (read-only, time-limited)
  - [ ] Add "Sign up to save your data" prompts
  - [ ] Implement guest → registered user conversion

- [ ] **Quick Signup**
  - [ ] Minimize required fields (username + password only)
  - [ ] Make email optional (or defer verification)
  - [ ] Add one-click signup (if using social login)
  - [ ] Streamline registration flow (single page, minimal steps)

- [ ] **Demo/Trial Mode**
  - [ ] Create demo account with sample data
  - [ ] Allow demo account access without registration
  - [ ] Show demo limitations clearly
  - [ ] Add "Create your own account" CTA

- [ ] **First-Time User Experience**
  - [ ] Design onboarding flow for new users
  - [ ] Add welcome message/tour
  - [ ] Guide users to add their first service
  - [ ] Show example queries/interactions
  - [ ] Add helpful tips and tooltips

### 6.7 Migration from Dev Auth

- [ ] **Migration Strategy**
  - [ ] Plan migration path from dev tokens to user accounts
  - [ ] Create migration script for existing dev users (if any)
  - [ ] Design backward compatibility layer (temporary)
  - [ ] Plan deprecation timeline for dev auth endpoint
  - [ ] Update all API endpoints to require real auth
  - [ ] Update frontend to remove dev login button

- [ ] **Data Migration**
  - [ ] Identify all data tied to dev user IDs
  - [ ] Plan user ID mapping strategy
  - [ ] Create migration scripts for existing data
  - [ ] Test migration on staging environment
  - [ ] Execute production migration

### 6.8 Security Enhancements

- [ ] **Rate Limiting**
  - [ ] Add rate limiting to login endpoint (prevent brute force)
  - [ ] Add rate limiting to registration endpoint (prevent spam)
  - [ ] Add rate limiting to password reset endpoint
  - [ ] Implement IP-based rate limiting
  - [ ] Implement user-based rate limiting

- [ ] **Security Headers**
  - [ ] Add security headers (CSP, HSTS, X-Frame-Options, etc.)
  - [ ] Implement CSRF protection
  - [ ] Add secure cookie flags (HttpOnly, Secure, SameSite)
  - [ ] Review and fix security vulnerabilities

- [ ] **Audit Logging**
  - [ ] Log all authentication events (login, logout, registration, etc.)
  - [ ] Log credential management events
  - [ ] Log failed login attempts
  - [ ] Add audit log query interface (for security monitoring)

- [ ] **Input Validation & Sanitization**
  - [ ] Validate all auth inputs (username, password, email)
  - [ ] Sanitize user inputs to prevent injection attacks
  - [ ] Validate password strength
  - [ ] Validate email format (if using email)

### 6.9 Testing

- [ ] **Unit Tests**
  - [ ] Test password hashing and verification
  - [ ] Test JWT generation and validation
  - [ ] Test credential encryption/decryption
  - [ ] Test auth middleware
  - [ ] Test rate limiting

- [ ] **Integration Tests**
  - [ ] Test registration flow end-to-end
  - [ ] Test login flow end-to-end
  - [ ] Test password reset flow
  - [ ] Test service credential management
  - [ ] Test credential forwarding to MCP services
  - [ ] Test multi-user data isolation

- [ ] **Security Testing**
  - [ ] Test brute force protection
  - [ ] Test SQL injection prevention
  - [ ] Test XSS prevention
  - [ ] Test CSRF protection
  - [ ] Test token tampering prevention
  - [ ] Test credential encryption

### 6.10 Documentation

- [ ] **User Documentation**
  - [ ] Document registration process
  - [ ] Document login process
  - [ ] Document password reset process
  - [ ] Document service credential setup
  - [ ] Create FAQ for common auth issues

- [ ] **Developer Documentation**
  - [ ] Document authentication architecture
  - [ ] Document API endpoints
  - [ ] Document credential management
  - [ ] Document security best practices
  - [ ] Create migration guide from dev auth

---

## 7. Testing & Quality Assurance

### Overview
Ensure quality and reliability across all new features and integrations.

### 6.1 Unit Testing

- [ ] **MCP Libraries**
  - [ ] Test MCP server library
  - [ ] Test MCP client library
  - [ ] Test protocol message handling
  - [ ] Test artifact handling

- [ ] **Voice Integration**
  - [ ] Test transcription API
  - [ ] Test audio processing
  - [ ] Test error handling

- [ ] **UI Components**
  - [ ] Test contact list component
  - [ ] Test message components
  - [ ] Test voice recorder component
  - [ ] Test responsive layouts

- [ ] **Services**
  - [ ] Test DiaryAnalyzer MCP server
  - [ ] Test ideas_log MCP server
  - [ ] Test workstyle MCP server

### 6.2 Integration Testing

- [ ] **End-to-End Flows**
  - [ ] Test MCP service discovery and connection
  - [ ] Test voice → transcription → chat flow
  - [ ] Test async messaging flow
  - [ ] Test multi-contact conversation switching
  - [ ] Test artifact generation and display

- [ ] **Service Integration**
  - [ ] Test Yukie → DiaryAnalyzer flow
  - [ ] Test Yukie → ideas_log flow
  - [ ] Test Yukie → workstyle flow
  - [ ] Test direct MCP service chat

### 6.3 Performance Testing

- [ ] **Load Testing**
  - [ ] Test concurrent users
  - [ ] Test message throughput
  - [ ] Test MCP service connection limits
  - [ ] Test database performance

- [ ] **Mobile Performance**
  - [ ] Test mobile rendering performance
  - [ ] Test PWA performance
  - [ ] Test offline mode performance

### 6.4 User Acceptance Testing

- [ ] **Usability Testing**
  - [ ] Test messenger-style UI flow
  - [ ] Test voice recording on mobile
  - [ ] Test async messaging experience
  - [ ] Test PWA installation and usage

- [ ] **Accessibility Testing**
  - [ ] Test keyboard navigation
  - [ ] Test screen reader compatibility
  - [ ] Test ARIA labels
  - [ ] Test color contrast

---

## Implementation Priority

### Phase 1: Foundation (Weeks 1-4)
1. Protocol Migration: YWAIP → MCP (Core implementation)
2. Basic MCP server/client libraries
3. Migrate existing services to MCP

### Phase 2: Authentication (Weeks 5-8)
1. User authentication system (registration, login, password management)
2. Service-level authentication and credential management
3. Multi-user data isolation
4. Migration from dev auth

### Phase 3: Voice & UI Basics (Weeks 9-12)
1. Voice-to-text integration
2. Responsive design & PWA setup
3. Basic messenger-style layout

### Phase 4: Advanced UI (Weeks 13-16)
1. Multiple contacts & MCP integration
2. Asynchronous messaging
3. Notification system

### Phase 5: Legacy Integration (Weeks 17-20)
1. DiaryAnalyzer integration
2. Ideas log integration
3. Workstyle integration

### Phase 6: Polish & Infrastructure (Weeks 21-24)
1. Infrastructure improvements
2. Monitoring & observability
3. Comprehensive testing
4. Documentation

---

## Success Criteria

### Protocol Migration
- [ ] All services use MCP protocol
- [ ] Artifact support working (images, files)
- [ ] Bidirectional communication working
- [ ] No YWAIP dependencies remaining

### Voice Integration
- [ ] Voice recording works on desktop and mobile
- [ ] Transcription accuracy is acceptable
- [ ] Integration with chat is seamless

### UI/UX
- [ ] App works well on mobile and desktop
- [ ] PWA installs and works offline
- [ ] Messenger-style UI is intuitive
- [ ] Multiple contacts work smoothly
- [ ] Async messaging works reliably

### Legacy Integration
- [ ] All three apps accessible via Yukie
- [ ] MCP servers are stable and performant
- [ ] User can seamlessly switch between services

### Authentication
- [ ] Users can register and login with username/password
- [ ] Service credentials can be stored and managed securely
- [ ] Multi-user data isolation works correctly
- [ ] Easy onboarding flow for new users
- [ ] Dev auth fully replaced with production auth

---

## Notes

- This is a living document and should be updated as work progresses
- Some tasks may be broken down further as implementation details emerge
- Dependencies between tasks should be considered when planning sprints
- Regular reviews and updates to this TODO are recommended
