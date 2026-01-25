 Implementation Summary                     
                                             
  Phase 1: Foundation                        
                                             
  - Protocol types                           
  (packages/shared/protocol/src/types.ts) -  
  YWAIP + YNFP TypeScript interfaces         
  - Auth module                              
  (packages/shared/auth/src/auth.ts) - JWT   
  generation/validation, scope checking,     
  middleware                                 
  - Logger (packages/shared/observability/src
  /logger.ts) - Structured logging           
  - LLM Client                               
  (packages/yukie-core/src/llm/client.ts) -  
  Anthropic/OpenAI abstraction               
                                             
  Phase 2: Yukie Core                        
                                             
  - Service Registry                         
  (packages/yukie-core/src/registry.ts) -    
  Service discovery and health checks        
  - Router                                   
  (packages/yukie-core/src/router.ts) -      
  LLM-based message routing                  
  - Policy                                   
  (packages/yukie-core/src/policy.ts) -      
  Auth/scope enforcement, rate limiting      
  - Inbox (packages/yukie-core/src/inbox.ts) 
  - Async job storage                        
  - Routes - Chat, Inbox, Health endpoints   
  - Server                                   
  (packages/yukie-core/src/server.ts) -      
  Express server                             
                                             
  Phase 3: Habit Tracker YWAIP               
                                             
  - Meta/Actions/Invoke endpoints -          
  YWAIP-compliant API                        
  - Action Executor - Handles check-ins,     
  queries, stats, delete                     
  - Domain LLM processing - Natural language 
  parsing for habits                         
                                             
  Phase 4: Chatbox UI (Vue 3)                
                                             
  - App.vue - Main layout with auth          
  - ChatWindow/MessageList/MessageBubble/Inpu
  tBar - Chat interface                      
  - InboxPanel - Async results display       
  - Pinia stores - Auth and chat state       
  management                                 
  - API client - Yukie Core integration      
                                             
  Phase 5: Integration                       
                                             
  - Vercel config (vercel.json) - Deployment 
  routing                                    
  - API entry points (api/*.ts) - Serverless 
  functions                                  
  - Environment template (.env.example)      
  - Scripts - Token generation helper        
                                             
  To Run Locally                             
                                             
  # Install dependencies                     
  npm install                                
                                             
  # Copy environment template                
  cp .env.example .env                       
  # Edit .env with your LLM_API_KEY and      
  JWT_SECRET                                 
                                             
  # Run all services                         
  npm run dev                                
                                             
  # Or run separately:                       
  npm run dev:core      # Yukie Core on :3000
  npm run dev:habit     # Habit Tracker on   
  :3001                                      
  npm run dev:chatbox   # Vue UI on :5173    
                                             
  Test Commands                              
                                             
  # Health check                             
  curl http://localhost:3000/healthz         
                                             
  # Generate dev token                       
  npm run generate-token                     
                                             
  # Chat (with token)                        
  curl -X POST http://localhost:3000/api/chat
   \                                         
    -H "Authorization: Bearer <token>" \     
    -H "Content-Type: application/json" \    
    -d '{"message": "Check me in for today"}'
                                             
✻ Churned for 19m 27s                        
                                             
❯ explain what the JWT is for                
                                             
⏺ The JWT (JSON Web Token) serves as the     
  authentication mechanism between the three 
  layers of the system.                      
                                             
  What It Does                               
                                             
  1. User Authentication to Yukie Core       
                                             
  When a user sends a chat message from the  
  Chatbox UI, the JWT proves who they are:   
                                             
  Chatbox UI  →  POST /api/chat  →  Yukie    
  Core                                       
                 Authorization: Bearer <jwt> 
                                             
  The JWT contains:                          
  - sub - User ID (e.g., "user-123")         
  - scopes - Permissions like ["yukie:chat", 
  "habit:read", "habit:write"]               
  - exp - Expiration timestamp               
                                             
  2. Scope-Based Authorization               
                                             
  Different endpoints require different      
  scopes. The JWT's scopes determine what a  
  user can do:                               
                                             
  // From packages/yukie-core/src/policy.ts  
  canUseChat(auth)      // requires          
  'yukie:chat'                               
  canAccessInbox(auth)  // requires          
  'yukie:inbox'                              
  canPerformAction(...) // checks            
  action-specific scopes like 'habit:write'  
                                             
  3. User Context Propagation                
                                             
  When Yukie Core calls the Habit Tracker    
  service, it passes the user identity via   
  headers (derived from the JWT):            
                                             
  Yukie Core  →  POST /api/v1/invoke  →      
  Habit Tracker                              
                 X-Yukie-User-Id: user-123   
                 X-Yukie-Scopes:             
  habit:read,habit:write                     
                                             
  This ensures the Habit Tracker knows which 
  user's data to access.                     
                                             
  Flow Summary                               
                                             
  User logs in → Gets JWT with userId +      
  scopes                                     
       ↓                                     
  Chatbox sends JWT with each request        
       ↓                                     
  Yukie Core validates JWT, extracts         
  userId/scopes                              
       ↓                                     
  Checks if user has required scopes for the 
  action                                     
       ↓                                     
  Passes user context to downstream services 
                                             
  In the current dev implementation, the     
  token is generated client-side for         
  simplicity. In production, you'd have a    
  proper login flow that issues JWTs from a  
  secure backend.    