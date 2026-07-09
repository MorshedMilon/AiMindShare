# PRD — M33: AI Agent Studio
**Layer:** L4 AI | **Priority:** P1 | **Phase:** 4 (Sessions 31–32)
**Depends On:** M12, M09, M14, pgvector, M41 | **Blocks:** M32, M34, M12 AI mode

## 1. Purpose
Build, train, and deploy custom AI chat agents — website widget, SMS, WhatsApp, Messenger — that answer from business knowledge, capture leads, and book appointments. The conversational brain of the platform (M34 gives it a voice).

## 2. Core Features
- **Agent builder:** name, persona/instructions (system prompt composer with guided fields: role, tone, do/don't rules, escalation policy), model selection (GPT-4o default), temperature; multiple agents per workspace (e.g. Support vs Sales).
- **Knowledge base (RAG):** ingest sources — website URL crawl (≤200 pages), file uploads (PDF/docx/txt via M06), FAQ pairs (manual editor), M22 articles toggle; chunking + OpenAI embeddings → pgvector; per-agent source selection; re-sync scheduling (weekly crawl refresh); retrieval: top-k with similarity threshold; citations optional in replies.
- **Capabilities (tools):** lead capture (collect name/email/phone conversationally → create/update M09 contact + tag), appointment booking (M14 slot search + book flow in-chat), handoff to human (M12 assignment + notification), custom Q&A guardrails ("if asked about price of X say…"), later: commerce tools (M32 registers).
- **Deployment channels:** website chat widget (M12 widget in agent mode — bubble, branded, proactive greeting rules by URL/time-on-page); SMS number binding; WhatsApp; FB Messenger — all via M12 channel infra with `aiMode` linking conversation→agent.
- **Conversation engine:** message in → contact/session context + retrieved chunks + tool schema → GPT-4o loop → reply/tool calls; conversation memory (last N turns + summary); confidence/handoff rules (low retrieval score, user frustration keywords, explicit request, N unanswered turns → human handoff with context summary posted as internal note); all messages through M12 (aiGenerated flag) + timeline; meter ai.tokens.
- **Testing sandbox:** in-builder chat preview against draft agent (suppressed side effects, tool-call trace visible).
- **Niche packs:** seeded agent templates (dental receptionist, real-estate qualifier, gym sales, restaurant reservations, agency support) — persona + starter FAQs + capability config.
- **Analytics:** conversations handled, containment rate (no handoff), leads captured, bookings made, top unanswered questions (retrieval misses feed a "teach me" queue → one-click add FAQ).

## 3. Database Schema (Prisma)
```prisma
model Agent {
  id String @id @default(uuid())
  workspaceId String; name String
  personaJson Json; modelConfig Json
  capabilitiesJson Json; handoffRulesJson Json
  status String @default("draft")
}
model KnowledgeSource {
  id String @id @default(uuid())
  workspaceId String; agentIds String[]
  type String // url|file|faq|articles
  configJson Json; status String; lastSyncAt DateTime?
}
model KnowledgeChunk {
  id String @id @default(uuid())
  sourceId String; workspaceId String
  content String; embedding Unsupported("vector(1536)")
  metadataJson Json
  @@index([workspaceId])
}
model AgentSession {
  id String @id @default(uuid())
  agentId String; conversationId String
  summaryText String?; state Json?
  handoffAt DateTime?; createdAt DateTime @default(now())
}
model UnansweredQuestion { id String @id @default(uuid()); agentId String; question String; count Int @default(1); resolvedFaqId String? }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/agents (+niche-pack install) | Builder |
| CRUD | /api/agents/knowledge (+sync) | Sources |
| POST | /api/agents/:id/chat | Core inference (used by M12 + sandbox) |
| POST | /api/agents/:id/test | Sandbox (no side effects) |
| POST | /api/agents/:id/deploy | Channel bindings |
| GET | /api/agents/:id/analytics (+unanswered) | Stats + teach queue |
| POST | /api/agents/unanswered/:id/resolve | Add FAQ from miss |

## 5. UI
- /agents: agent cards (status, channel badges, 7d stats)
- /agents/[id]: tabs — Persona (guided prompt composer), Knowledge (sources table + sync status + chunk counts), Capabilities (toggles + config), Channels (deploy), Test (sandbox chat with tool trace), Analytics (containment, leads, teach-me queue)

## 6. Acceptance Criteria
- [ ] URL crawl→embed→retrieval answers doc-specific question correctly in sandbox
- [ ] Lead capture creates contact mid-conversation; booking completes real M14 appointment
- [ ] Handoff posts context summary note + assigns + notifies within seconds
- [ ] Widget/SMS/WhatsApp deployments all route through M12 with aiGenerated labeling
- [ ] Retrieval misses populate teach-me queue; resolving adds FAQ chunk
- [ ] ai.tokens metered per turn; hard-stop degrades gracefully (handoff message)

## 7. Claude Code Prompt — M33
```
Build Module M33 (AI Agent Studio). M12/M09/M14/M41 + pgvector exist.
1. Prisma models per PRD (pgvector extension migration).
2. Ingestion workers: crawler (cheerio, robots-aware, 200pg cap),
   file parser (pdf-parse/mammoth), FAQ editor rows, article sync;
   chunker (~500 tokens, overlap 50) → embeddings (OpenAI, batched,
   metered) → KnowledgeChunk.
3. lib/agents/engine.ts chat(agentId, conversationId, message):
   build context (persona + summary + last turns + top-k chunks
   above threshold) + tool schemas (capture_lead, book_appointment
   [M14 slots/book], handoff, end) → GPT-4o tool loop → actions →
   reply. Handoff rule evaluation each turn. Session summary update
   every 10 turns.
4. M12 integration: aiMode conversations call engine; widget greeting
   rules; SMS/WhatsApp/Messenger bindings.
5. Sandbox mode flag (tools mocked, trace returned). Niche pack seeds.
6. Teach-me pipeline: low-similarity queries logged → UI queue →
   resolve-to-FAQ creating chunk.
7. Builder UI per PRD with tabbed editor + sandbox pane.
```

*Next: M34 — AI Voice Agents*
