# PRD — M34: AI Voice Agents ⭐
**Layer:** L4 AI | **Priority:** P2 | **Phase:** 7
**Depends On:** M33, M14, M12, M05, M41 (Twilio, OpenAI Realtime) | **Blocks:** —

## 1. Purpose
Give M33 agents a phone: AI receptionist answering inbound calls 24/7, outbound qualification calls, and verbal appointment booking — the single most futuristic, demo-able feature in the platform.

## 2. Core Features
- **Inbound receptionist:** Twilio number → media stream → speech pipeline → agent brain (M33 engine, voice-tuned persona: shorter responses, verbal formatting) → TTS reply; capabilities: answer business questions (RAG), take messages (→ M12 conversation + notification), **book appointments verbally** (M14 slot search read aloud, confirm, book, SMS confirmation), transfer to human number (warm transfer with whisper summary), after-hours vs business-hours behavior modes.
- **Speech stack:** Twilio Programmable Voice + Media Streams ↔ OpenAI Realtime API (speech-to-speech, low latency) as primary; fallback pipeline Deepgram STT → GPT-4o → ElevenLabs TTS via adapter interface; barge-in support (caller interrupts).
- **Outbound campaigns:** call lists from smart lists — use cases: lead qualification (script goals: qualify budget/timeline → update contact fields + tag hot/warm/cold), appointment reminders/confirmations (press-1 confirm / press-2 reschedule → SMS link), review requests, win-back; pacing (max concurrent, retry no-answers ×2, calling-hours windows per contact tz); **compliance hard gates:** consent.check(voice) per contact (M05), DNC respect, per-jurisdiction disclosure ("this is an AI assistant calling on behalf of…") configurable + mandatory where required, recording-consent handling by region.
- **Voicemail handling:** inbound VM transcription → M12; outbound machine detection → configurable voicemail drop (pre-recorded or TTS).
- **Call records:** every call → recording (opt-dependent), full transcript, AI summary, extracted entities (name/intent/callback time), outcome tag → M12 conversation entry + `timeline.add(call)` + triggers (`call.completed`, `call.booked`, `call.hot_lead`).
- **Live monitor:** active calls dashboard (listen-in optional), live transcript stream (Pusher).
- **Metering:** `voice.minutes` per leg (M03, HARD_STOP with graceful "please call back" behavior + alert).
- **Voice config:** voice selection (provider voices + cloned brand voice), speaking rate, greeting scripts, hold behavior.

## 3. Database Schema (Prisma)
```prisma
model VoiceAgent {
  id String @id @default(uuid())
  workspaceId String; agentId String // M33 brain
  twilioNumberSid String?; phoneNumber String?
  voiceConfigJson Json; hoursJson Json
  disclosureText String; status String @default("draft")
}
model Call {
  id String @id @default(uuid())
  workspaceId String; voiceAgentId String?
  contactId String?; direction String
  fromNumber String; toNumber String
  status String; durationSec Int?
  recordingUrl String?; transcriptJson Json?
  summaryText String?; outcome String?
  twilioCallSid String @unique
  createdAt DateTime @default(now())
}
model OutboundCampaign {
  id String @id @default(uuid())
  workspaceId String; voiceAgentId String
  name String; scriptGoalJson Json
  audienceJson Json; pacingJson Json
  status String @default("draft")
  statsJson Json?
}
model OutboundCallTask { id String @id @default(uuid()); campaignId String; contactId String; attempts Int @default(0); status String; scheduledAt DateTime?; callId String? }
```

## 4. API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| CRUD | /api/voice/agents (+number provision) | Setup |
| POST | /api/voice/incoming | Twilio voice webhook → media stream handshake |
| WS | /api/voice/stream | Media stream ↔ realtime pipeline |
| CRUD | /api/voice/campaigns (+start/pause) | Outbound |
| GET | /api/voice/calls (+/:id transcript) | Records |
| GET | /api/voice/live | Active calls (monitor) |
| POST | /api/voice/calls/:id/transfer | Warm transfer |

## 5. UI
- /voice: agents list, number provisioning wizard, live calls panel
- /voice/agents/[id]: voice config (voice picker w/ preview, greeting, hours, disclosure, transfer targets), linked M33 brain, test-call button (calls your cell)
- /voice/campaigns: campaign builder (audience, script goals, pacing, compliance checklist gate), progress dashboard (dials, connects, outcomes)
- /voice/calls: log with player + transcript + summary

## 6. Acceptance Criteria
- [ ] Inbound call answered <2s; conversational latency acceptable (<1.5s p50 response)
- [ ] Verbal booking creates real M14 appointment + SMS confirmation
- [ ] Barge-in works; transfer executes with whisper summary
- [ ] Outbound blocked without voice consent; disclosure plays when enabled; calling-hours enforced
- [ ] Machine detection → voicemail drop; retries scheduled
- [ ] Transcript/summary/outcome land in M12 + timeline; triggers fire
- [ ] voice.minutes metered accurately; hard-stop mid-call behavior graceful

## 7. Claude Code Prompt — M34
```
Build Module M34 (Voice Agents). M33/M14/M12/M05/M41 exist.
1. Prisma models per PRD. Twilio number search/provision via M41.
2. Realtime pipeline: /incoming returns TwiML <Connect><Stream>;
   WS handler bridges Twilio media frames ↔ OpenAI Realtime API
   (voice-tuned system prompt from M33 persona + voice tools:
   lookup_knowledge, take_message, check_slots, book_appointment,
   transfer, end_call). Adapter interface for fallback STT/TTS stack.
3. Tool implementations calling M33 retrieval, M14 slots/book (speak
   3 options), M12 message creation, Twilio transfer with whisper.
4. Call lifecycle: status callbacks → Call rows; recording +
   post-call worker (transcript store, GPT-4o summary/entities/outcome,
   M12 + timeline + triggers, voice.minutes meter from duration).
5. Outbound engine: campaign → tasks → pacing dispatcher (concurrency,
   tz hours, consent + DNC gates, AMD with VM drop, retry logic).
6. Live monitor via Pusher transcript events. UI per PRD with
   compliance checklist blocking campaign start until acknowledged.
```

*Next: M35 — Creative Studio*
