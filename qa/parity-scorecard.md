# HustlyTasker vs Discord — Parity Scorecard (Phase 11)

> Per playbook §11 — auto-detect presence/absence of each Discord feature.
> Parity gaps are **recommendations only**, never gating.
>
> Generated 2026-06-05 against branch `claude/cranky-austin` (`bffb78d`).

## Scoring legend

- ✅ **Present** — feature exists and is wired
- 🟡 **Partial** — exists but missing common sub-features
- ❌ **Missing** — would need new work
- ➖ **Not applicable** — product decision (e.g., DMs not part of HustlyTasker)

## Scorecard

| # | Feature | Status | File evidence | Recommendation |
|---|---|---|---|---|
| 1 | Edit-message UI | ✅ | `ChannelView.tsx` row-hover pencil opens inline textarea, Enter saves via `editMessage`, Esc cancels. `(đã sửa)` indicator already present at line 542 | shipped — see commit `<this commit>` |
| 2 | Delete-message UI | ✅ | `ChannelView.tsx:565` (Trash2 icon, `title="Xoá"`) | — |
| 3 | Channel-rename UI | 🟡 | server action `renameChannel` at `channel-actions.ts:161`; UI present in settings modal | — verify rename works in settings modal |
| 4 | Channel-delete UI | 🟡 | server action `deleteChannel` at `:176`; UI via settings modal | — |
| 5 | Promote-to-MODERATOR UI | ❌ | `ChannelMember.role` is wired but no UI to change it | P2 — add role dropdown in member list |
| 6 | Reactions on thread-starter message | 🟡 | reactions wired everywhere; thread starter just uses `MessageRow` semantics | — verify with manual test |
| 7 | Custom emoji upload | ❌ | only emoji-mart standard set | P3 — workspace-scoped uploads |
| 8 | Stickers/GIFs | ❌ | not implemented | P3 — Tenor/Giphy via server action |
| 9 | Voice channel without text channel | ❌ | LiveKit calls launch from a TEXT channel header | P2 — separate VOICE channel type |
| 10 | Direct Messages (DMs) | ➖ | product decision — internal team tool, not 1:1 social | — |
| 11 | Friend system | ➖ | same as DMs | — |
| 12 | Stage channels | ➖ | Discord-specific community feature | — |
| 13 | Server-wide custom-permission roles | ✅ | `CustomRole` + `CustomRoleMember` + `ChannelOverwrite` shipped (ChatP2-1..4) | — |
| 14 | Server-boost equivalent | ➖ | freemium not relevant here | — |
| 15 | Audit log | 🟡 | `AuditLog` table exists; no UI surface for chat actions | P2 — workspace admin audit page |
| 16 | "Jump to message" link copy | ❌ | not implemented | P3 — message-id deep links |
| 17 | Quote/forward message | ❌ | not implemented | P3 |
| 18 | Read receipts | ➖ | playbook recommends OFF for Discord parity (Discord does NOT have read receipts; Slack does) | — keep off |
| 19 | Threaded notification follow/unfollow | 🟡 | THREAD_REPLY notification fires; explicit follow/unfollow UI missing | P3 |
| 20 | @everyone / @here | ❌ | not implemented | P3 — special tokens in `parseMentions` |
| 21 | Slow mode | ✅ | `Channel.slowModeSeconds` + UI (ChatP3-1) | — |
| 22 | Pinned messages | ✅ | full pin/unpin + popover (ChatP1) | — |
| 23 | Threads / reply panel | ✅ | `Message.parentId` + ThreadPanel (ChatP1) | — |
| 24 | Forum channels | ✅ | `Channel.type=FORUM` + ForumView (ChatP3-2) | — |
| 25 | WIKI channels | ✅ | `Channel.type=WIKI` + Tiptap WikiClient | — |
| 26 | Voice/video calls (LiveKit) | ✅ | tokens minted + room modal (Phase 2A) | TTL hardening (P6O) — shorten from 6h default |
| 27 | Attachments (image + file) | ✅ | Vercel Blob + 10MB/10-file cap | — |
| 28 | @-mention autocomplete | ✅ | cmdk-style picker in composer (Phase 2C) | — |
| 29 | Typing indicators | ✅ | TYPING event + usePresence hook (Phase 2D) | — |
| 30 | Online presence | ✅ | Supabase presence (Phase 2D) | — |
| 31 | Unread badges | ✅ | per-channel + 99+ cap (Phase 2E) | — |
| 32 | Mute toggle | ✅ | `ChannelMember.muted` + bell button | — |
| 33 | Link previews (OG unfurl) | ✅ | `LinkPreview` model + after()-hook unfurl (ChatP3-3) | — |
| 34 | Search (cmdk) | ✅ | `searchMessages` action + modal (ChatP1) | — |
| 35 | Client-portal messaging | ✅ | per-client channel + multi-channel switcher (ChatP2-5) | unique to HustlyTasker |

## Parity summary

- **Present (✅)**: 18 / 35 — core Discord-equivalent features (incl. edit-message UI shipped)
- **Partial (🟡)**: 5 / 35 — exist but trimmed
- **Missing (❌)**: 7 / 35 — not implemented yet
- **N/A (➖)**: 5 / 35 — explicit product decisions

**Parity score: 18 ✅ + 5 🟡 = 23 / 30 in-scope features ≈ 77% Discord-parity**
(excluding the 5 N/A items)

## Recommended fix priority

| P0 — blockers (none) | — |
| ~~P1 — high leverage~~ | ~~Edit-message UI (#1)~~ — **shipped** |
| P2 — medium leverage | Promote-to-MOD UI (#5), VOICE channel type (#9), Audit log UI (#15) |
| P3 — nice-to-have | Custom emoji upload (#7), Stickers/GIFs (#8), Jump-to-message (#16), Quote/forward (#17), @everyone (#20), Thread follow (#19) |

## Notes on items deliberately diverging from Discord

- **Read receipts (#18)**: Discord doesn't have them; Slack does. HustlyTasker
  chose the Discord path. The `LastReadAt` field is per-user unread tracking,
  NOT per-message read receipts. This is intentional.
- **No god-mode for admins (vs Discord ADMINISTRATOR bypass)**: HustlyTasker
  is STRICTER — workspace admins are subject to `ChannelMember` + overwrite
  rules. Verified by Phase 4 spec `26-perm-godmode.admin.spec.ts`.
- **DMs (#10), friend system (#11), stage (#12)**: out of scope by design —
  HustlyTasker is an internal team tool, not a social chat platform.
