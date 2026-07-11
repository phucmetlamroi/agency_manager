// [Review module P4.2] Full-page review player shell (route team/asset/[assetId]).
// Left = video stage; right = a tabbed panel (Bình luận / Thông tin). A version
// selector switches versions WITHOUT a page reload (swaps the hls source + panel).
// The comments panel is mounted in P4.3; P4.2 ships the player + info + selector.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Info,
  Clock,
  UploadCloud,
  Columns2,
  Download,
  FileVideo,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  listAssetVersions,
  apiMarkFeedbackDone,
  type AssetVersions,
  type VersionRow,
} from "@/lib/review/team-actions";
import { uploadEngine, validateFileMeta } from "@/lib/review/upload-engine";
import { fetchDownloadUrl } from "@/lib/review/player-api";
import { REVIEW_MODULE_LABEL } from "@/lib/review/labels";
import { canAutoTransition } from "@/lib/task-statuses";
import { REVIEW_STATUS_MAP } from "@/lib/review/status-map";
import { ReviewFlowActions } from "./ReviewFlowActions";
import type { Fps } from "@/lib/review/timecode";
import type { AnnotationShape, CommentDto } from "@/lib/review/comment-client";
import { useHlsPlayer } from "./useHlsPlayer";
import { VideoStage } from "./VideoStage";
import { useComments } from "./useComments";
import { useAnnotation } from "./useAnnotation";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { CommentsPanel } from "./CommentsPanel";
import { TimelineMarkers } from "./TimelineMarkers";
import { PendingRangeOverlay } from "./PendingRangeOverlay";
import { useRangeSelection, useRangePlayback } from "./useRangeSelection";
import { internalPlayerEnv, PlayerEnvProvider } from "./player-env";
import { CompareView } from "./CompareView";

type Tab = "comments" | "info";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
function fmtBytes(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

interface ReviewPlayerShellProps {
  workspaceId: string;
  assetId: string;
  currentUserId: string;
  isAdmin: boolean;
  initialVersionId: string | null;
  initialCommentId: string | null;
  /** [F6/P5] LIVE ?cmp=<left>.<right> from the URL (NOT a seed) — drives Compare mode.
   *  Live so browser Back (which drops cmp + re-runs this force-dynamic page) exits compare. */
  compareParam: string | null;
}

/** P5.3: the internal shell provides the INTERNAL PlayerEnv (VN copy, /api/review/*,
 *  full capabilities) — the hooks/components under it read the env instead of
 *  hard-wiring the API, so the same tree also serves guests on /r/{slug}. */
export function ReviewPlayerShell(props: ReviewPlayerShellProps) {
  const env = useMemo(
    () =>
      internalPlayerEnv({
        currentUserId: props.currentUserId,
        isAdmin: props.isAdmin,
      }),
    [props.currentUserId, props.isAdmin],
  );
  return (
    <PlayerEnvProvider value={env}>
      <ReviewPlayerShellInner {...props} />
    </PlayerEnvProvider>
  );
}

function ReviewPlayerShellInner({
  workspaceId,
  assetId,
  currentUserId,
  isAdmin,
  initialVersionId,
  initialCommentId,
  compareParam,
}: ReviewPlayerShellProps) {
  const router = useRouter();
  const [data, setData] = useState<AssetVersions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(
    initialVersionId,
  );
  const [tab, setTab] = useState<Tab>("comments");
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(
    initialCommentId,
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const didDeepLink = useRef(false);
  // [B10] "Tải version mới" — the player had no upload affordance; a new version is a
  // single video enqueued onto THIS asset ({kind:'asset'}), which the engine + server
  // already support (write scope re-checked server-side). Drop OR file-picker.
  const versionInputRef = useRef<HTMLInputElement>(null);
  const [uploadDragOver, setUploadDragOver] = useState(false);

  // load the stack
  useEffect(() => {
    let cancelled = false;
    listAssetVersions(assetId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setCurrentVersionId((prev) => {
          if (prev && res.versions.some((v) => v.id === prev)) return prev;
          return res.asset.currentVersionId ?? res.versions[0]?.id ?? null;
        });
      })
      .catch(
        (e) =>
          !cancelled &&
          setLoadError(
            e instanceof Error ? e.message : "Không tải được asset.",
          ),
      );
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const asset = data?.asset ?? null;
  const version: VersionRow | null = useMemo(
    () => data?.versions.find((v) => v.id === currentVersionId) ?? null,
    [data, currentVersionId],
  );
  const isVideo = asset?.mediaKind === "video";

  // [Download] Fetch a short-lived presigned R2 GET of the ORIGINAL file (byte-identical to the
  // uploaded file — not a Mux rendition) and let the browser save it. Member route re-guards
  // access + folder scope; the object is served with an attachment Content-Disposition.
  const [downloading, setDownloading] = useState(false);
  const handleDownload = useCallback(async () => {
    if (!version || downloading) return;
    setDownloading(true);
    try {
      const { url } = await fetchDownloadUrl(version.id);
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.download = version.originalName || "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tải xuống thất bại.");
    } finally {
      setDownloading(false);
    }
  }, [version, downloading]);
  const ready = version?.uploadStatus === "ready";
  const headerFileName = version?.originalName || asset?.name || "";
  const versionIndex = version
    ? (data?.versions.findIndex((item) => item.id === version.id) ?? -1)
    : -1;
  const olderVersion =
    versionIndex >= 0 ? (data?.versions[versionIndex + 1] ?? null) : null;
  const newerVersion =
    versionIndex > 0 ? (data?.versions[versionIndex - 1] ?? null) : null;

  // [F6/P5] Compare mode. Parse ?cmp=<left>.<right> against the loaded stack; a stale/garbage
  // cmp (or <2 versions) degrades gracefully to single view. Derived from the LIVE prop so
  // browser Back (drops cmp → re-runs the page → compare=null) collapses back to single.
  // Computed BEFORE `enabled` so the single player is DISABLED while CompareView renders: otherwise
  // its hls instance leaks a 3rd stream for the whole session AND never re-attaches on exit (exit
  // re-mounts the <video> but versionId/enabled are unchanged, so useHlsPlayer's attach effect
  // never re-runs → the primary player is left permanently blank).
  const compare = useMemo(() => {
    if (!compareParam || !data) return null;
    const [l, r] = compareParam.split(".");
    if (!l || !r || l === r) return null;
    const has = (id: string) => data.versions.some((v) => v.id === id);
    return has(l) && has(r) ? { left: l, right: r } : null;
  }, [compareParam, data]);
  const renderingCompare = compare != null && isVideo;

  const enabled = !!isVideo && ready && !renderingCompare;
  const fps: Fps | null = version?.fps
    ? { num: version.fps.num, den: version.fps.den }
    : null;
  const posterUrl = version?.media?.posterUrl ?? null;

  const controller = useHlsPlayer({
    videoRef,
    versionId: enabled ? version!.id : null,
    fps,
    enabled,
  });
  const feed = useComments(version?.id ?? null);

  // [L14] Live per-version comment count for the selector. VersionDto.commentCount from
  // listAssetVersions is a snapshot frozen at page-load, so a comment added THIS session leaves
  // it stale (dropdown shows "v1 · 0 bình luận" when 1 exists). The active feed already polls the
  // current version's live total + every sibling's live count every 5s — overlay those, falling
  // back to the frozen snapshot only when no live data has arrived yet.
  const liveCommentCount = useCallback(
    (v: VersionRow): number => {
      if (v.id === version?.id) {
        // During the very first load (no data yet) fall back to the frozen snapshot so an
        // active version with comments doesn't flash "· 0" before the first fetch lands.
        return feed.isLoading && feed.comments.length === 0
          ? v.commentCount
          : feed.total;
      }
      const sib = feed.otherVersions.find((o) => o.versionId === v.id);
      return sib ? sib.commentCount : v.commentCount;
    },
    [
      version?.id,
      feed.total,
      feed.isLoading,
      feed.comments.length,
      feed.otherVersions,
    ],
  );

  const compareBase = `/${workspaceId}/team/asset/${assetId}`;
  // Enter: default pairing = left is the version adjacent to current (older neighbor, else newer),
  // right is the current version. push() = new history entry so Back exits compare.
  const enterCompare = useCallback(() => {
    if (!data || data.versions.length < 2) return;
    const curId = currentVersionId ?? data.versions[0]?.id ?? null;
    const idx = data.versions.findIndex((v) => v.id === curId);
    const leftId =
      data.versions[idx + 1]?.id ?? data.versions[idx - 1]?.id ?? null;
    if (!leftId || !curId || leftId === curId) return;
    router.push(`${compareBase}?cmp=${leftId}.${curId}`);
  }, [data, currentVersionId, router, compareBase]);
  const exitCompare = useCallback(
    (rightId: string) => {
      setCurrentVersionId(rightId); // single view resumes on the right/current version
      // replace() (not push): enterCompare already pushed the compare entry, so the browser
      // Back from single-view lands on the pre-compare state — not back INTO compare.
      router.replace(`${compareBase}?v=${rightId}`);
    },
    [router, compareBase],
  );
  // Version swap on a side rewrites ?cmp with replace() (no history spam) — the shell is the
  // SOLE ?cmp writer; the new prop flows back through page.tsx and re-renders CompareView.
  const changeCompareSides = useCallback(
    (l: string, r: string) => {
      router.replace(`${compareBase}?cmp=${l}.${r}`);
    },
    [router, compareBase],
  );

  // [P3-B] Derived task/role context for the F8/F9/F10 staff actions (server re-checks all).
  const isAssignee = !!asset?.assigneeId && asset.assigneeId === currentUserId;
  // F9 gate: parent comments on the CURRENT version still open. F8 gate: any comment exists.
  const unresolvedCount = useMemo(
    () =>
      feed.comments.filter((c) => c.parentId == null && c.completedAt == null)
        .length,
    [feed.comments],
  );
  const hasComments = feed.comments.length > 0;
  // A feedback session is "open" when an admin has feedback on a just-submitted (A2) cut.
  const feedbackSessionOpen =
    isAdmin &&
    hasComments &&
    canAutoTransition(
      asset?.taskStatus ?? "",
      REVIEW_STATUS_MAP.internalFeedbackOpen,
    );

  // Re-fetch the stack so the staff-action buttons reflect the new task status after a flip.
  const reloadAsset = useCallback(() => {
    listAssetVersions(assetId)
      .then((res) => setData(res))
      .catch(() => {
        /* keep last good data */
      });
  }, [assetId]);

  // [FR-04] Pending timecode/range shared between the composer (right) and the timeline
  // (left). range-playback LOOPS [in,out] (frame.io) until the range is cleared.
  const range = useRangeSelection();
  const { playRange, stopRange } = useRangePlayback(
    controller.frame,
    controller.seekToFrame,
    controller.play,
  );
  // Turn the loop off the instant the range is cleared or collapsed to a point (✕ / composer close).
  useEffect(() => {
    if (!range.active || range.outFrame == null) stopRange();
  }, [range.active, range.outFrame, stopRange]);

  // Annotation draw state (P4.4). Owned here because BOTH the overlay and the
  // composer read it. `viewAnno` is the read-only "show this comment's drawing"
  // mode (mutually exclusive with drawing).
  const annotation = useAnnotation();
  const { reset: annoReset } = annotation;
  const [viewAnno, setViewAnno] = useState<{
    shapes: AnnotationShape[];
    frame: number;
  } | null>(null);
  // [annotation fix] Do NOT gate on version.width/height. Those come from Mux metadata and are null
  // for older versions / when Mux never reported dimensions — that quietly disabled the ENTIRE draw
  // feature (no toolbar, no canvas, composer got annotation=null → the "can't draw" report). The
  // AnnotationCanvas now derives the media box from the LIVE <video> element, so only isVideo matters.
  const canAnnotate = isVideo;
  // Latest draw-mode flag for the keydown handler without re-subscribing the listener.
  const annoActiveRef = useRef(false);
  annoActiveRef.current = annotation.active;

  // The controller object identity changes every render (frame/currentSec state),
  // but its METHODS are stable useCallbacks — depend on those so playback-rate
  // re-renders don't tear down/rebuild the window listener 30–60×/sec.
  const {
    toggle: ctlToggle,
    step: ctlStep,
    pause: ctlPause,
    seekToFrame: ctlSeek,
  } = controller;

  const onPauseVideo = ctlPause;
  const onFocusPlayer = useCallback(() => {
    const el = document.activeElement as HTMLElement | null;
    el?.blur?.();
  }, []);
  const handleSeek = ctlSeek;

  // Click a comment's "Hình vẽ" chip → seek + pause + show its drawing read-only.
  const onViewAnnotation = useCallback(
    (c: CommentDto) => {
      if (!c.annotation) return;
      annoReset(); // leave any draw-in-progress; the two modes are exclusive
      if (c.startFrame != null) ctlSeek(c.startFrame);
      ctlPause();
      setViewAnno({ shapes: c.annotation, frame: c.startFrame ?? 0 });
      setHighlightId(c.id);
    },
    [annoReset, ctlSeek, ctlPause],
  );

  // The read-only drawing is pinned to a frame → drop it once the video PLAYS.
  // (Split from the draw-mode clear below so an `active` true→false transition can't
  // re-run this with a stale isPlaying and wipe a viewAnno that onViewAnnotation just
  // set in the same commit — ctlPause() only pauses the DOM, isPlaying flips async.)
  useEffect(() => {
    if (controller.isPlaying) setViewAnno(null);
  }, [controller.isPlaying]);

  // Starting a new drawing also clears the read-only view (mutually exclusive modes).
  useEffect(() => {
    if (annotation.active) setViewAnno(null);
  }, [annotation.active]);

  // Invariant: while drawing, the video stays PAUSED AND PARKED on the pinned frame
  // so every stroke is committed against the frame the annotation is saved to. The
  // keydown handler blocks Space/step during draw and click-to-play is disabled on
  // the stage; this backstops anything else that starts playback (control-bar ▶)
  // by re-pausing AND seeking back to the pinned frame.
  const annoFrame = annotation.frame;
  useEffect(() => {
    if (annotation.active && controller.isPlaying) {
      ctlPause();
      if (annoFrame != null) ctlSeek(annoFrame);
    }
  }, [annotation.active, controller.isPlaying, ctlPause, ctlSeek, annoFrame]);

  // Switching version invalidates any drawing / view tied to the old frame space.
  useEffect(() => {
    annoReset();
    setViewAnno(null);
  }, [currentVersionId, annoReset]);

  // Keyboard: Space toggles, ←/→ frame-step — when focus is not in a text field.
  // [F6] Also off while Compare renders: `enabled` is false there (single controller disabled),
  // so this returns early and CompareView owns the sole keydown handler (no two Space handlers).
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      // While drawing, the frame is LOCKED to the annotation's pinned frame — block
      // play/step so strokes can't be committed against a frame they aren't saved to.
      if (annoActiveRef.current) return;
      if (e.code === "Space") {
        e.preventDefault();
        ctlToggle();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        ctlStep(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        ctlStep(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, ctlToggle, ctlStep]);

  // Deep-link ?comment= : once its comment loads, seek + highlight + scroll to it.
  useEffect(() => {
    if (didDeepLink.current || !initialCommentId || feed.comments.length === 0)
      return;
    const c = feed.comments.find((x) => x.id === initialCommentId);
    if (!c) return;
    didDeepLink.current = true;
    setTab("comments");
    setHighlightId(c.id);
    if (c.startFrame != null) ctlSeek(c.startFrame);
    requestAnimationFrame(() =>
      document
        .getElementById(`comment-${c.id}`)
        ?.scrollIntoView({ block: "center" }),
    );
  }, [feed.comments, initialCommentId, ctlSeek]);

  const goBack = useCallback(async () => {
    const folderId = asset?.folderId;
    const dest = folderId
      ? `/${workspaceId}/team/folder/${folderId}`
      : `/${workspaceId}/team`;
    // [FR-08] Leaving an OPEN feedback session (admin · task "Đã nộp video (nội bộ)" · ≥1 comment):
    // offer to close it on the way out. OK = chốt phiên (flip → A3 + notify editor) rồi thoát;
    // Cancel = thoát mà chưa chốt. Comments are already persisted on Enter — this only flips state.
    if (feedbackSessionOpen) {
      const ok = window.confirm(
        "Đã gửi xong feedback cho editor?\n\nOK = chốt phiên (editor được thông báo cần sửa) rồi thoát.\nCancel = thoát, chưa chốt.",
      );
      if (ok) {
        try {
          await apiMarkFeedbackDone(assetId);
        } catch {
          /* best-effort — still leave */
        }
      }
    }
    router.push(dest);
  }, [router, workspaceId, asset?.folderId, feedbackSessionOpen, assetId]);

  // [FR-08] Best-effort tab-close warning while a feedback session is open. The browser will
  // NOT run the async flip on unload (fetches are killed) — this only surfaces the native
  // "leave site?" prompt so an admin doesn't lose an in-progress session by accident. The
  // reliable triggers are the "Kết thúc feedback" button + the goBack confirm above.
  useEffect(() => {
    if (!feedbackSessionOpen) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [feedbackSessionOpen]);

  // [B10] Enqueue a new version onto this asset. Video-only (same rule as the drawer
  // BÀN GIAO strip); the ready card refresh comes from listAssetVersions on the next poll.
  const uploadNewVersion = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      const meta = validateFileMeta(
        file.name,
        file.size,
        file.type || "application/octet-stream",
      );
      if (!meta.ok) {
        toast.error(meta.message);
        return;
      }
      if (meta.kind !== "VIDEO") {
        toast.error("Chỉ tải lên video cho phiên bản mới.");
        return;
      }
      uploadEngine.enqueue(
        file,
        { kind: "asset", assetId },
        { targetLabel: asset?.name ?? "Phiên bản mới" },
      );
      toast.success("Đang tải phiên bản mới…");
    },
    [assetId, asset?.name],
  );

  // [B10] Window guard: a file dropped ANYWHERE on the player page must not make the
  // browser navigate away to open the file; also reset the drop overlay after any drop.
  useEffect(() => {
    const hasFiles = (dt: DataTransfer | null) =>
      !!dt && Array.from(dt.types).includes("Files");
    const onWinDragOver = (e: DragEvent) => {
      if (hasFiles(e.dataTransfer)) e.preventDefault();
    };
    const onWinDrop = (e: DragEvent) => {
      if (hasFiles(e.dataTransfer)) e.preventDefault();
      setUploadDragOver(false);
    };
    window.addEventListener("dragover", onWinDragOver);
    window.addEventListener("drop", onWinDrop);
    return () => {
      window.removeEventListener("dragover", onWinDragOver);
      window.removeEventListener("drop", onWinDrop);
    };
  }, []);

  if (loadError) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 text-white/70">
        <div className="text-center">
          <p className="mb-3 text-sm">{loadError}</p>
          <button
            onClick={goBack}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
          >
            Quay lại {REVIEW_MODULE_LABEL}
          </button>
        </div>
      </div>
    );
  }
  if (!data || !asset) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-white/50" />
      </div>
    );
  }

  // [F6/P5] Compare mode replaces the single-player body (video assets only — the shared
  // transport is video-specific; a stale ?cmp on an image degrades to single view).
  if (renderingCompare && compare) {
    return (
      <CompareView
        versions={data.versions}
        left={compare.left}
        right={compare.right}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        assetName={asset.name}
        onExit={() => exitCompare(compare.right)}
        onBack={goBack}
        onChangeSides={changeCompareSides}
      />
    );
  }

  const annotationOverlay =
    canAnnotate && annotation.active ? (
      <>
        <AnnotationCanvas
          editable
          shapes={annotation.shapes}
          tool={annotation.tool}
          color={annotation.color}
          size={annotation.size}
          intrinsicWidth={version?.width ?? null}
          intrinsicHeight={version?.height ?? null}
          videoRef={videoRef}
          onCommitShape={annotation.addShape}
        />
        <AnnotationToolbar ctl={annotation} />
      </>
    ) : canAnnotate && viewAnno && !controller.isPlaying ? (
      <AnnotationCanvas
        editable={false}
        shapes={viewAnno.shapes}
        tool={annotation.tool}
        color={annotation.color}
        size={annotation.size}
        intrinsicWidth={version?.width ?? null}
        intrinsicHeight={version?.height ?? null}
        videoRef={videoRef}
        onCommitShape={annotation.addShape}
      />
    ) : null;

  return (
    <div className="flex h-[100dvh] flex-col bg-[#090a0c] text-zinc-100">
      {/* Header: asset context at left, version navigation and workspace controls at right. */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.10] bg-[#111317] px-3 shadow-[0_1px_0_rgba(255,255,255,0.035)]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            onClick={goBack}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/70 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            aria-label="Quay lại thư mục"
            title="Quay lại thư mục"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span
            className="hidden h-4 w-px shrink-0 bg-white/[0.12] sm:block"
            aria-hidden="true"
          />

          <nav
            className="flex min-w-0 items-center gap-1 text-[13px]"
            aria-label="Vị trí tệp"
          >
            <FileVideo className="hidden h-4 w-4 shrink-0 text-violet-300 sm:block" />
            <button
              onClick={goBack}
              className="hidden shrink-0 text-white/50 transition hover:text-white md:inline"
              title={"Mở thư mục chứa trong " + REVIEW_MODULE_LABEL}
            >
              {REVIEW_MODULE_LABEL}
            </button>
            <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-white/25 md:block" />
            {asset.name !== headerFileName && (
              <>
                <span className="hidden max-w-36 truncate text-white/60 lg:inline">
                  {asset.name}
                </span>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-white/25 lg:block" />
              </>
            )}
            <h1
              className="min-w-0 truncate font-medium text-white"
              title={headerFileName}
            >
              {headerFileName}
            </h1>
          </nav>

          <input
            ref={versionInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              uploadNewVersion(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <div className="relative shrink-0">
            <button
              onClick={() => setSelectorOpen((open) => !open)}
              className="flex h-8 items-center gap-1 rounded-md border border-white/[0.12] bg-white/[0.045] px-2 text-xs font-medium text-white transition hover:border-white/[0.22] hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              aria-label="Chọn phiên bản"
              aria-expanded={selectorOpen}
              title="Chọn phiên bản"
            >
              <span>v{version?.versionNumber ?? "—"}</span>
              <ChevronDown className="h-3.5 w-3.5 text-white/55" />
            </button>
            {selectorOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setSelectorOpen(false)}
                />
                <div className="absolute left-0 top-10 z-40 max-h-[70vh] w-72 overflow-auto rounded-md border border-white/[0.14] bg-[#171a20] p-1.5 shadow-2xl">
                  {data.versions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentVersionId(item.id);
                        setSelectorOpen(false);
                      }}
                      className={
                        item.id === currentVersionId
                          ? "flex w-full items-center gap-2 rounded-md bg-violet-400/[0.12] px-2.5 py-2 text-left text-sm text-white"
                          : "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-white/75 transition hover:bg-white/[0.08] hover:text-white"
                      }
                    >
                      <span className="grid h-7 w-8 shrink-0 place-items-center rounded bg-white/[0.07] text-xs font-semibold text-violet-200">
                        v{item.versionNumber}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-white">
                          {item.originalName}
                        </span>
                        <span className="block text-xs text-white/50">
                          {fmtDate(item.createdAt)} · {liveCommentCount(item)}{" "}
                          bình luận
                        </span>
                      </span>
                      {item.id === asset.currentVersionId && (
                        <span className="shrink-0 rounded bg-emerald-400/[0.12] px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                          Hiện tại
                        </span>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      if (data.versions.length >= 2) {
                        enterCompare();
                        setSelectorOpen(false);
                      }
                    }}
                    disabled={data.versions.length < 2}
                    title={
                      data.versions.length < 2
                        ? "Cần ít nhất 2 phiên bản để so sánh"
                        : "So sánh phiên bản"
                    }
                    className={
                      data.versions.length < 2
                        ? "mt-1 hidden w-full items-center gap-2 border-t border-white/[0.10] px-2.5 py-2.5 text-left text-sm text-white/25 md:flex"
                        : "mt-1 hidden w-full items-center gap-2 border-t border-white/[0.10] px-2.5 py-2.5 text-left text-sm text-violet-200 transition hover:bg-white/[0.08] md:flex"
                    }
                  >
                    <Columns2 className="h-4 w-4 shrink-0" /> So sánh phiên bản
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => versionInputRef.current?.click()}
            className="hidden h-8 w-8 shrink-0 place-items-center rounded-md text-white/65 transition hover:bg-white/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 sm:grid"
            aria-label="Tải phiên bản mới"
            title="Tải phiên bản mới"
          >
            <UploadCloud className="h-4 w-4" />
          </button>
        </div>

        <ReviewFlowActions
          assetId={assetId}
          taskStatus={asset.taskStatus}
          isAdmin={isAdmin}
          isAssignee={isAssignee}
          unresolvedCount={unresolvedCount}
          hasComments={hasComments}
          onDone={reloadAsset}
        />

        <div className="flex shrink-0 items-center gap-1">
          <div className="hidden items-center overflow-hidden rounded-md border border-white/[0.12] bg-white/[0.035] md:flex">
            <button
              type="button"
              onClick={() =>
                olderVersion && setCurrentVersionId(olderVersion.id)
              }
              disabled={!olderVersion}
              className="grid h-8 w-8 place-items-center text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:text-white/20"
              aria-label="Phiên bản cũ hơn"
              title="Phiên bản cũ hơn"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-12 border-x border-white/[0.10] px-2 text-center text-[11px] font-medium tabular-nums text-white/65">
              {versionIndex >= 0 ? versionIndex + 1 : "—"} /{" "}
              {data.versions.length}
            </span>
            <button
              type="button"
              onClick={() =>
                newerVersion && setCurrentVersionId(newerVersion.id)
              }
              disabled={!newerVersion}
              className="grid h-8 w-8 place-items-center text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:text-white/20"
              aria-label="Phiên bản mới hơn"
              title="Phiên bản mới hơn"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {version?.uploadStatus === "ready" && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex h-8 items-center gap-1.5 rounded-md bg-violet-500 px-2.5 text-xs font-semibold text-white shadow-[0_5px_14px_rgba(124,58,237,0.26)] transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              title="Tải file gốc về máy"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Tải xuống</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            className={
              panelOpen
                ? "grid h-8 w-8 place-items-center rounded-md bg-white/[0.08] text-white transition hover:bg-white/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                : "grid h-8 w-8 place-items-center rounded-md text-white/70 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            }
            aria-label={panelOpen ? "Ẩn panel review" : "Hiện panel review"}
            title={panelOpen ? "Ẩn panel review" : "Hiện panel review"}
            aria-pressed={panelOpen}
          >
            {panelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Stage */}
        <div
          className="relative min-h-0 flex-1 bg-[#050505]"
          onDragEnter={(e) => {
            if (Array.from(e.dataTransfer.types).includes("Files")) {
              e.preventDefault();
              setUploadDragOver(true);
            }
          }}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes("Files")) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDragLeave={(e) => {
            // Only clear when the pointer actually leaves the stage (not a child).
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setUploadDragOver(false);
          }}
          onDrop={(e) => {
            if (Array.from(e.dataTransfer.types).includes("Files")) {
              e.preventDefault();
              setUploadDragOver(false);
              uploadNewVersion(e.dataTransfer.files?.[0]);
            }
          }}
        >
          {uploadDragOver && (
            <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary px-8 py-6 text-center">
                <UploadCloud className="h-9 w-9 text-primary-accent" />
                <p className="text-sm font-medium text-primary-accent">
                  Thả để tạo v
                  {data.versions.reduce(
                    (m, v) => Math.max(m, v.versionNumber),
                    0,
                  ) + 1}
                </p>
              </div>
            </div>
          )}
          {version && ready ? (
            <VideoStage
              videoRef={videoRef}
              controller={controller}
              fps={fps}
              mediaKind={isVideo ? "video" : "image"}
              versionId={version.id}
              posterUrl={posterUrl}
              overlay={annotationOverlay}
              clickToggleDisabled={annotation.active}
              timelineChildren={
                <>
                  <TimelineMarkers
                    comments={feed.comments}
                    fps={fps}
                    durationSec={controller.durationSec}
                    onSeek={handleSeek}
                    onHighlight={setHighlightId}
                  />
                  <PendingRangeOverlay
                    range={range}
                    fps={fps}
                    durationSec={controller.durationSec}
                    playheadFrame={controller.frame}
                    onPlayRange={playRange}
                    onScrubFrame={controller.seekToFrame}
                  />
                </>
              }
            />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-white/60">
              <div className="flex flex-col items-center gap-3">
                <Clock className="h-8 w-8 text-white/40" />
                <p className="text-sm">
                  {version
                    ? version.uploadStatus === "failed"
                      ? "Phiên bản xử lý thất bại."
                      : "Phiên bản đang được xử lý…"
                    : "Không có phiên bản để xem."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Review panel can collapse for distraction-free playback, like Frame.io's panel controls. */}
        {panelOpen && (
          <aside className="flex h-[42vh] shrink-0 flex-col border-t border-white/[0.12] bg-[#121417] shadow-[-16px_0_32px_rgba(0,0,0,0.18)] lg:h-auto lg:w-[380px] lg:border-l lg:border-t-0">
            <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.10] bg-[#16191d] px-3">
              <TabBtn
                active={tab === "comments"}
                onClick={() => setTab("comments")}
                icon={<MessageSquare className="h-4 w-4" />}
              >
                Bình luận
              </TabBtn>
              <TabBtn
                active={tab === "info"}
                onClick={() => setTab("info")}
                icon={<Info className="h-4 w-4" />}
              >
                Thông tin
              </TabBtn>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {tab === "comments" ? (
                version ? (
                  <CommentsPanel
                    versionId={version.id}
                    fps={fps}
                    mediaKind={isVideo ? "video" : "image"}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    feed={feed}
                    playheadFrame={controller.frame}
                    durationMs={version.durationMs}
                    annotation={canAnnotate ? annotation : null}
                    range={range}
                    onSeekToFrame={handleSeek}
                    onPauseVideo={onPauseVideo}
                    onFocusPlayer={onFocusPlayer}
                    onViewAnnotation={onViewAnnotation}
                    highlightId={highlightId}
                    onJumpToVersion={(vid) => setCurrentVersionId(vid)}
                  />
                ) : null
              ) : (
                <div className="h-full overflow-auto">
                  <InfoTab version={version} assetId={assetId} />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
        active
          ? "border-violet-400 bg-violet-400/[0.07] text-white"
          : "border-transparent text-white/55 hover:bg-white/[0.04] hover:text-white/90"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

interface StatusHistoryEntry {
  id: string;
  label: string;
  actor: string;
  versionNumber: number | null;
  createdAt: string;
}

function InfoTab({
  version,
  assetId,
}: {
  version: VersionRow | null;
  assetId: string;
}) {
  // FR-G04 "Lịch sử trạng thái": read the append-only status events for this stack.
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/review/assets/${assetId}/status-history`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then(
        (d: { entries?: StatusHistoryEntry[] }) =>
          alive && setHistory(d.entries ?? []),
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [assetId]);

  if (!version)
    return <div className="p-4 text-sm text-white/40">Không có thông tin.</div>;
  const rows: [string, string][] = [
    ["Tên file", version.originalName],
    ["Phiên bản", `v${version.versionNumber}`],
    ["Người tải lên", version.uploadedBy?.name ?? "—"],
    ["Ngày", fmtDate(version.createdAt)],
    ["Dung lượng", fmtBytes(version.sizeBytes)],
    [
      "Kích thước",
      version.width && version.height
        ? `${version.width}×${version.height}`
        : "—",
    ],
    ["FPS", version.fps ? (version.fps.num / version.fps.den).toFixed(2) : "—"],
    [
      "Thời lượng",
      version.durationMs ? `${Math.round(version.durationMs / 1000)}s` : "—",
    ],
    ["Bình luận", String(version.commentCount)],
  ];
  return (
    <div>
      <dl className="divide-y divide-white/5">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-start justify-between gap-4 px-4 py-2.5"
          >
            <dt className="text-xs text-white/40">{k}</dt>
            <dd
              className="max-w-[60%] truncate text-right text-sm text-white/85"
              title={v}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>

      {history.length > 0 && (
        <div className="border-t border-white/5 px-4 py-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">
            <Clock className="h-3 w-3" /> Lịch sử trạng thái
          </h4>
          <ol className="relative space-y-2 pl-3">
            {history.map((h) => (
              <li key={h.id} className="relative text-sm">
                <span className="absolute -left-3 top-1.5 h-1.5 w-1.5 rounded-full bg-primary/70" />
                <div className="text-white/85">
                  {h.label}
                  {h.versionNumber != null && (
                    <span className="text-white/40"> · v{h.versionNumber}</span>
                  )}
                </div>
                <div className="text-[11px] text-white/40">
                  {h.actor} · {fmtDate(h.createdAt)}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
