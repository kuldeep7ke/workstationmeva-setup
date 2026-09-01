import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { getCustomScript } from '../utils/tpCustom';
import { ArrowLeft, Play, Pause, RotateCcw, Loader2, AlertTriangle, History, FlipHorizontal2, CheckCircle2, X, Flag, Settings2, BookOpen, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

export default function Teleprompter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const loadSetting = (key: string, fallback: number) => {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };

  const [scrolling, setScrolling] = useState(false);
  // Speed is signed (-10…+10); unlike the other settings it may be <= 0.
  const [speed, setSpeed] = useState(() => {
    const raw = localStorage.getItem('tp_speed');
    if (raw === null) return 3;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.max(-10, Math.min(10, v)) : 3;
  });
  const [fontSize, setFontSize] = useState(() => loadSetting('tp_fontSize', 32));
  const [lineSpacing, setLineSpacing] = useState(() => loadSetting('tp_spacing', 1.6));
  const [mirror, setMirror] = useState(() => localStorage.getItem('tp_mirror') === '1');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>((localStorage.getItem('tp_align') as 'left' | 'center' | 'right') || 'left');

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyTab, setHistoryTab] = useState<'today' | 'archive'>('today');

  const [finishState, setFinishState] = useState<'idle' | 'finishing' | 'done'>('idle');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [endPopup, setEndPopup] = useState<'none' | 'ended'>('none');
  const [showGuide, setShowGuide] = useState(false);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const [speedFlash, setSpeedFlash] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const dwellRef = useRef<number>(0);
  const finishDoneRef = useRef(false);
  const startSentRef = useRef(false);
  const hideTimerRef = useRef<number>(0);
  const speedFlashTimerRef = useRef<number>(0);
  // While the operator repositions the script by hand, auto-scroll holds off
  // briefly instead of fighting the manual movement.
  const manualHoldUntilRef = useRef(0);

  const flashSpeed = useCallback((value: number) => {
    setSpeedFlash(value);
    clearTimeout(speedFlashTimerRef.current);
    speedFlashTimerRef.current = window.setTimeout(() => setSpeedFlash(null), 1000);
  }, []);

  const nudgeScroll = useCallback((px: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.min(max, Math.max(0, el.scrollTop + px));
    posRef.current = el.scrollTop;
    manualHoldUntilRef.current = Date.now() + 1500;
  }, []);

  const showOptions = () => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
  };

  const fetchData = async () => {
    // Custom scripts: created on the list page, stored device-local.
    if (id && id.startsWith('custom-')) {
      const c = getCustomScript(id);
      if (c) {
        setData({ task_id: 0, task_title: c.title, anchor_name: '', script: c.text, is_task: false });
      } else {
        setErr('Custom script not found on this device');
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr('');
    setFinishState('idle');
    finishDoneRef.current = false;
    startSentRef.current = false;
    try {
      const storyRes = await api.get(`/stories/teleprompter/${id}`);
      if (storyRes.data?.script) {
        setData({ task_id: storyRes.data.task_id, task_title: storyRes.data.task_title, script: storyRes.data.script, anchor_name: storyRes.data.anchor_name || '', is_task: storyRes.data.is_task === true });
        setLoading(false);
        return;
      }
    } catch {}
    try {
      const taskRes = await api.get(`/tasks/teleprompter/script/${id}`);
      setData({ ...taskRes.data, is_task: taskRes.data.is_task === true });
    } catch {
      setErr('Script not found');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = (tab: 'today' | 'archive') => {
    api.get(`/tasks/teleprompter/history${tab === 'archive' ? '?archive=1' : ''}`)
      .then((res) => setHistory(Array.isArray(res.data) ? res.data : []))
      .catch(() => setHistory([]));
  };

  useEffect(() => { fetchData(); fetchHistory(historyTab); }, [id, historyTab]);

  useEffect(() => {
    if (!loading && data) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 3000);
    }
  }, [loading, data]);

  useEffect(() => { localStorage.setItem('tp_speed', String(speed)); }, [speed]);
  useEffect(() => { localStorage.setItem('tp_fontSize', String(fontSize)); }, [fontSize]);
  useEffect(() => { localStorage.setItem('tp_spacing', String(lineSpacing)); }, [lineSpacing]);
  useEffect(() => { localStorage.setItem('tp_mirror', mirror ? '1' : '0'); }, [mirror]);
  useEffect(() => { localStorage.setItem('tp_align', textAlign); }, [textAlign]);

  const enterFullscreen = () => {
    const el: any = document.documentElement;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  };

  const triggerFinish = useCallback(() => {
    if (!data || finishDoneRef.current) return;
    finishDoneRef.current = true;
    setFinishState('finishing');
    api.post(`/tasks/teleprompter/finish/${data.task_id}`)
      .then((res) => {
        if (res.data && res.data.success) {
          stopScroll();
          setEndPopup('none');
          navigate('/teleprompter');
        } else {
          finishDoneRef.current = false;
          setFinishState('idle');
        }
      })
      .catch(() => {
        finishDoneRef.current = false;
        setFinishState('idle');
      });
  }, [data]);

   const speedRef = useRef(speed); speedRef.current = speed;
   const fontSizeRef = useRef(fontSize); fontSizeRef.current = fontSize;
   const scrollingRef = useRef(scrolling); scrollingRef.current = scrolling;
   const finishStateRef = useRef(finishState); finishStateRef.current = finishState;
   const endPopupRef = useRef(endPopup); endPopupRef.current = endPopup;
   const currentVelRef = useRef(0);
   const wheelAccumRef = useRef(0);
   // Own float position accumulator: element.scrollTop truncates fractions,
   // which made slow speeds (0.5-2.0) appear not to scroll at all.
   const posRef = useRef(0);
  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const delta = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;
    const el = scrollRef.current;
    let halted = false;
    if (el) {
      // Ease the actual velocity toward the target so speed changes and
      // direction reversals glide instead of jumping.
      const target = speedRef.current;
      const cur = currentVelRef.current;
      const k = 1 - Math.exp(-delta / 150);
      const vel = cur + (target - cur) * k;
      currentVelRef.current = Math.abs(vel) < 0.01 && target === 0 ? 0 : vel;
      if (Date.now() >= manualHoldUntilRef.current) {
        const nextPos = posRef.current + (vel * delta) / 75;
        el.scrollTop = nextPos;
        const clamped =
          Math.abs(el.scrollTop - nextPos) > 1 ||
          el.scrollTop <= 0 ||
          el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
        posRef.current = clamped ? el.scrollTop : nextPos;
        // Reversed all the way to the top: park at default forward speed,
        // ready to run down again.
        if (el.scrollTop <= 0 && vel < 0) {
          currentVelRef.current = 0;
          setSpeed(3);
          flashSpeed(3);
          setScrolling(false);
          cancelAnimationFrame(rafRef.current);
          return;
        }
      }
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
      // Arriving at the bottom parks the script at default reverse speed
      // (-3): one wheel roll or Space immediately climbs back up. The end
      // popup appears after a short dwell unless the user reverses away.
      if (atBottom && vel > 0 && endPopupRef.current === 'none' && finishStateRef.current !== 'done' && !finishDoneRef.current) {
        if (!dwellRef.current) {
          if (speedRef.current !== -3) {
            setSpeed(-3);
            flashSpeed(-3);
          }
          currentVelRef.current = 0;
          halted = true;
          setScrolling(false);
          const dwellMs = 2000 + (fontSizeRef.current - 18) * 20;
          dwellRef.current = window.setTimeout(() => {
            dwellRef.current = 0;
            const el2 = scrollRef.current;
            const stillBottom = !!el2 && el2.scrollTop + el2.clientHeight >= el2.scrollHeight - 10;
            if (stillBottom && endPopupRef.current === 'none' && finishStateRef.current !== 'done' && !finishDoneRef.current) {
              setEndPopup('ended');
            }
          }, dwellMs);
        }
      } else if (!atBottom && dwellRef.current) {
        clearTimeout(dwellRef.current);
        dwellRef.current = 0;
      }
    }
    if (!halted) rafRef.current = requestAnimationFrame(animate);
  }, []);

   const beginScroll = (enterFs: boolean) => {
     if (scrolling || finishState === 'done') return;
     if (speed === 0) setSpeed(3);
     lastTimeRef.current = 0;
     posRef.current = scrollRef.current?.scrollTop ?? 0;
     setScrolling(true);
     setShowScrollbar(false);
     rafRef.current = requestAnimationFrame(animate);
     if (enterFs) enterFullscreen();
     clearTimeout(hideTimerRef.current);
     hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 1500);
     // Release focus from whichever button started playback so keyboard
     // shortcuts keep working afterwards.
     (document.activeElement as HTMLElement | null)?.blur?.();
     if (data?.is_task && !startSentRef.current) {
       startSentRef.current = true;
       api.post(`/tasks/teleprompter/start/${data.task_id}`).catch(() => {});
     }
   };

   const startScroll = () => beginScroll(true);

    const stopScroll = () => {
      setScrolling(false);
      cancelAnimationFrame(rafRef.current);
      (document.activeElement as HTMLElement | null)?.blur?.();
      // Do not exit fullscreen, show scrollbar, or force controls visible - only pause the scroll
    };

  // Latest starter for event handlers registered once (keyboard/wheel).
  const beginScrollRef = useRef(beginScroll);
  beginScrollRef.current = beginScroll;

  // Imaginary-Teleprompter style signed velocity: positive scrolls down,
  // negative scrolls back up, zero holds position. One axis, no modes.
  // Adjusting velocity while paused resumes motion (without forcing
  // fullscreen), exactly like Imaginary Teleprompter.
  const adjustSpeed = useCallback((delta: number) => {
    if (endPopupRef.current === 'ended' || finishStateRef.current === 'done') return;
    setSpeed((s) => {
      const next = Math.max(-10, Math.min(10, Math.round((s + delta) * 10) / 10));
      if (next !== s) flashSpeed(next);
      return next;
    });
    if (!scrollingRef.current && endPopupRef.current === 'none') {
      currentVelRef.current = 0;
      beginScrollRef.current(false);
    }
  }, [flashSpeed]);

  const resetScroll = () => {
    stopScroll();
    currentVelRef.current = 0;
    posRef.current = 0;
    setSpeed(3);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const handleRestart = () => {
    setEndPopup('none');
    finishDoneRef.current = false;
    setFinishState('idle');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    currentVelRef.current = 0;
    posRef.current = 0;
    setSpeed(3);
    lastTimeRef.current = 0;
    setScrolling(true);
    rafRef.current = requestAnimationFrame(animate);
    enterFullscreen();
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 1500);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowHistory(false);
        setShowGuide(false);
        if (endPopupRef.current === 'ended') setEndPopup('none');
        setControlsVisible(true);
        clearTimeout(hideTimerRef.current);
        return;
      }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.tagName === 'BUTTON')) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (endPopupRef.current === 'ended' || finishStateRef.current === 'done') break;
          if (scrollingRef.current) stopScroll();
          else startScroll();
          break;
        // Imaginary-Teleprompter style velocity control: one axis for speed
        // AND direction. Down slows toward zero then reverses; up does the
        // opposite. W/S mirror the arrows.
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          adjustSpeed(-0.5);
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          adjustSpeed(0.5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          setFontSize((s) => Math.min(64, s + 2));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFontSize((s) => Math.max(18, s - 2));
          break;
        case 'PageUp':
          e.preventDefault();
          nudgeScroll(-Math.round((scrollRef.current?.clientHeight || 400) * 0.8));
          break;
        case 'PageDown':
          e.preventDefault();
          nudgeScroll(Math.round((scrollRef.current?.clientHeight || 400) * 0.8));
          break;
        case 'r':
        case 'R':
          resetScroll();
          break;
        case 'm':
        case 'M':
          setMirror((m) => !m);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nudgeScroll, adjustSpeed]);

  // Mouse wheel = speed control (wheel up faster, wheel down slower),
  // middle-click = reset speed to default. Overlays (guide, history,
  // end popup) keep their normal scrolling.
  useEffect(() => {
    const inOverlay = (target: EventTarget | null) =>
      !!(target as HTMLElement | null)?.closest?.('[data-tp-overlay]');
    const onWheel = (e: WheelEvent) => {
      if (inOverlay(e.target)) return;
      e.preventDefault();
      // Shift + wheel moves the script itself up / down (works while
      // scrolling or paused); auto-scroll resumes after a short hold.
      if (e.shiftKey) {
        nudgeScroll(e.deltaY < 0 ? -90 : 90);
        return;
      }
      // Same axis as the arrows: wheel up speeds forward, wheel down slows
      // toward zero and then reverses — exactly like Imaginary Teleprompter.
      // Deltas accumulate so trackpads and free-spinning wheels ramp the
      // speed smoothly instead of in hard jumps.
      wheelAccumRef.current += e.deltaY;
      const STEP = 100;
      while (Math.abs(wheelAccumRef.current) >= STEP) {
        adjustSpeed(wheelAccumRef.current > 0 ? -0.5 : 0.5);
        wheelAccumRef.current -= Math.sign(wheelAccumRef.current) * STEP;
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      if (inOverlay(e.target)) return;
      e.preventDefault();
      setSpeed(3);
      flashSpeed(3);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousedown', onMouseDown);
      clearTimeout(speedFlashTimerRef.current);
    };
  }, [flashSpeed, nudgeScroll, adjustSpeed]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (dwellRef.current) clearTimeout(dwellRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      exitFullscreen();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (err || !data || !data.script) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white/70 text-lg">{err || 'Script not found'}</p>
          <Link to="/teleprompter" className="inline-block mt-6 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">
            Back to Scripts
          </Link>
        </div>
      </div>
    );
  }

  const STATUS_LABEL: Record<string, string> = {
    teleprompter_ready: 'Ready',
    prompting: 'Prompting',
    recording_done: 'Recorded',
    editing: 'Editing',
    uploading: 'Uploading',
    under_review: 'Under Review',
    completed: 'Completed',
  };

  return (
<div className="h-screen bg-black flex flex-col relative overflow-hidden">
      {/* Close button: always visible whenever the script is not actively
          prompting (idle or paused). Hidden only while scrolling. */}
      {!scrolling && finishState !== 'done' && (
        <button onClick={() => navigate('/teleprompter')}
          title="Close teleprompter"
          className="absolute top-3 left-3 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white border border-white/15 transition-colors">
          <X className="w-5 h-5" />
        </button>
      )}
       <div ref={scrollRef} className={`flex-1 min-h-0 overflow-y-auto px-6 sm:px-12 py-8 scroll-smooth ${!showScrollbar ? 'tp-no-scrollbar' : ''}`}
         style={{ scrollBehavior: 'auto', transform: mirror ? 'scaleX(-1)' : undefined }}>
        <div className="max-w-4xl mx-auto" style={{ fontSize: `${fontSize}px`, lineHeight: lineSpacing, textAlign }}>
          <h1 className="text-white/90 font-bold mb-6 text-center" style={{ fontSize: `${fontSize * 1.2}px` }}>
            {data.task_title}
          </h1>
          {data.anchor_name && (
            <p className="text-white/50 text-center mb-8" style={{ fontSize: `${fontSize * 0.6}px` }}>
              Anchor: {data.anchor_name}
            </p>
          )}
          <div className="text-white/85 whitespace-pre-wrap">
            {data.script}
          </div>
        </div>
      </div>

      {finishState === 'done' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4" /> Recording finished — task sent to the editor
        </div>
      )}

      {speedFlash !== null && (
        <div className="absolute top-4 right-4 z-40 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/30 text-xs font-medium pointer-events-none transition-opacity">
          Speed {speedFlash.toFixed(1)}{speedFlash < 0 ? ' ◀' : speedFlash > 0 ? ' ▶' : ''}
        </div>
      )}

      {endPopup === 'ended' && (
        <div data-tp-overlay className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setEndPopup('none')}>
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-white mb-1">Script Ended</h3>
            <p className="text-sm text-white/50 mb-6">You have reached the end of the script.</p>
            <div className="flex flex-col gap-2">
              {data.is_task && finishState !== 'done' && (
                <button onClick={triggerFinish} disabled={finishState === 'finishing'}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50">
                  <Flag className="w-4 h-4" /> {finishState === 'finishing' ? 'Marking…' : 'Finished'}
                </button>
              )}
              <button onClick={handleRestart}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors">
                <RotateCcw className="w-4 h-4" /> Restart
              </button>
              <button onClick={() => setEndPopup('none')}
                className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showGuide && (
        <div data-tp-overlay className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowGuide(false)}>
          <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2 text-white font-semibold">
                <BookOpen className="w-5 h-5 text-green-400" /> Teleprompter Operating Guide
              </div>
              <button onClick={() => setShowGuide(false)} className="text-white/50 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm text-white/70">
              <section>
                <h3 className="text-green-400 font-semibold mb-1">1. Getting Started</h3>
                <p>Open <span className="text-white/90">Teleprompter</span> from the main menu. The page shows scripts that are <span className="text-white/90">Ready to Record</span> (task scripts), <span className="text-white/90">Approved Stories</span>, and <span className="text-white/90">Previously Loaded Scripts</span> from today. Click any script to open it on the teleprompter screen. Need something that is not in the list? Use <span className="text-white/90">New Script</span> to paste your own text and prompt it right away — custom scripts are saved on this device.</p>
              </section>
              <section>
                <h3 className="text-green-400 font-semibold mb-1">2. Start Prompting</h3>
                <p>Press the green <span className="text-white/90">Start</span> button (or <span className="text-white/90">Spacebar</span>). The screen goes <span className="text-white/90">fullscreen</span> (address bar hidden), the options bar slides away, and the script auto-scrolls at your saved speed. Press <span className="text-white/90">Spacebar</span>, the floating <span className="text-white/90">Pause</span> pill, or <span className="text-white/90">Escape</span> to pause — the options bar comes back. All speed controls (wheel, arrows, W/S) work <span className="text-white/90">even while paused</span> — adjusting speed while paused resumes scrolling immediately, no fullscreen needed. The <span className="text-white/90">close button</span> (top-left) is always visible whenever the script is not actively prompting.</p>
              </section>
              <section>
                <h3 className="text-green-400 font-semibold mb-1">3. Adjusting the Display</h3>
                <p>The bottom bar has <span className="text-white/90">Speed</span> (scroll pace — drag it below zero to reverse upward), <span className="text-white/90">Font</span> (text size), <span className="text-white/90">Spacing</span> (line spacing) sliders, <span className="text-white/90">Alignment</span> (left / center / right) options, plus a <span className="text-white/90">Mirror</span> toggle for a mirror-image display (prompter glass). All settings are <span className="text-white/90">saved automatically</span> in the browser and restored for your next prompting session.</p>
              </section>
              <section>
                <h3 className="text-green-400 font-semibold mb-1">4. Keyboard Shortcuts</h3>
                <div className="bg-white/5 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <div><span className="text-white/90 font-medium">Space</span> — play / pause</div>
                  <div><span className="text-white/90 font-medium">↑ / W / wheel up</span> — speed up forward</div>
                  <div><span className="text-white/90 font-medium">↓ / S / wheel down</span> — slow down, then reverse upward (values go negative)</div>
                  <div><span className="text-white/90 font-medium">Reaching the bottom</span> — parks at <span className="text-white/90">-3.0 ◀</span>, ready to reverse instantly</div>
                  <div><span className="text-white/90 font-medium">Reaching the top</span> — parks at <span className="text-white/90">3.0 ▶</span>, ready to run forward again</div>
                  <div><span className="text-white/90 font-medium">Middle click</span> — reset speed to default</div>
                  <div><span className="text-white/90 font-medium">Shift + wheel</span> — move script up / down freely</div>
                  <div><span className="text-white/90 font-medium">PageUp / PageDown</span> — jump back / forward</div>
                  <div><span className="text-white/90 font-medium">← / →</span> — font smaller / larger</div>
                  <div><span className="text-white/90 font-medium">R</span> — reset scroll to top</div>
                  <div><span className="text-white/90 font-medium">M</span> — mirror display toggle</div>
                  <div><span className="text-white/90 font-medium">Escape</span> — pause / close popups</div>
                </div>
              </section>
              <section>
                <h3 className="text-green-400 font-semibold mb-1">5. When the Script Ends</h3>
                <p>Reaching the bottom <span className="text-white/90">parks the script at -3.0 ◀</span> — one wheel roll down or Space instantly reverses back upward at full reverse speed. If you do nothing, after a short reading delay a popup appears:</p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li><span className="text-white/90">Finished</span> — automatically completes the recording stage and sends this task (and any related bulletin tasks) to the editor.</li>
                  <li><span className="text-white/90">Restart</span> — returns to the top (speed resets to 3.0 ▶) and resumes prompting.</li>
                  <li><span className="text-white/90">Close</span> — dismiss the popup without marking anything.</li>
                </ul>
                <p className="mt-1">Reversing away from the bottom before the popup appears cancels it. Reaching the <span className="text-white/90">top</span> in reverse parks at <span className="text-white/90">3.0 ▶</span>, ready to run forward again.</p>
              </section>
              <section>
                <h3 className="text-green-400 font-semibold mb-1">6. Scripts Drawer</h3>
                <p>Press <span className="text-white/90">Scripts</span> to open the list of previously loaded scripts — <span className="text-white/90">Today</span> tab shows scripts loaded today, <span className="text-white/90">Archived</span> tab has all older scripts. Click one to reload it if you need to re-record.</p>
              </section>
              <section>
                <h3 className="text-green-400 font-semibold mb-1">7. Saving Settings</h3>
                <p>Speed, font size, spacing and mirror are saved on the machine automatically. No action needed — your last-used display is restored whenever you open the teleprompter.</p>
              </section>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <>
          <div className="absolute inset-0 bg-black/60 z-30" onClick={() => setShowHistory(false)} />
          <div data-tp-overlay className="absolute top-0 right-0 bottom-16 w-full sm:w-96 bg-zinc-900 border-l border-white/10 z-40 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-white font-semibold">
                <History className="w-4 h-4 text-green-400" /> Scripts
              </div>
              <button onClick={() => setShowHistory(false)} className="text-white/50 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-1 px-3 pt-3">
              <button onClick={() => setHistoryTab('today')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${historyTab === 'today' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/50 hover:text-white/80'}`}>
                Today
              </button>
              <button onClick={() => setHistoryTab('archive')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${historyTab === 'archive' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/50 hover:text-white/80'}`}>
                Archived
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {history.length === 0 ? (
                <p className="text-white/40 text-sm text-center py-8">{historyTab === 'today' ? 'No scripts loaded today yet' : 'No archived scripts'}</p>
              ) : history.map((h) => (
                <Link key={h.task_id} to={`/teleprompter/${h.task_id}`}
                  onClick={() => setShowHistory(false)}
                  className={`block p-3 rounded-lg border transition-colors ${h.task_id === Number(id) ? 'border-green-500/50 bg-green-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                  <div className="text-sm font-medium text-white/90">{h.task_title}</div>
                  <div className="text-xs text-white/40 mt-1 flex flex-wrap items-center gap-x-2">
                    <span>{h.anchor_name || '—'}</span>
                    <span>·</span>
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/60">{STATUS_LABEL[h.status] || h.status}</span>
                    <span>·</span>
                    <span>{h.script_imported_at ? new Date(h.script_imported_at.replace(' ', 'T')).toLocaleString() : ''}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      <div className={`bg-zinc-900/95 border-t border-white/10 px-4 py-3 flex flex-wrap items-center justify-center gap-3 shrink-0 z-40 transition-all duration-300 ${controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'}`}>
        <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-white/30 select-none w-full text-center justify-center -mb-1">
          Space play/pause · ↑/W faster ▶ · ↓/S slower ◀ reverse · wheel same · Shift+wheel move · PgUp·PgDn jump · middle-click reset · ends park ◀-3 / ▶3 · ←→ font · R top · M mirror
        </div>
        <button onClick={scrolling ? stopScroll : startScroll}
          disabled={finishState === 'done'}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: scrolling ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)', color: scrolling ? '#f87171' : '#4ade80' }}>
          {scrolling ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {scrolling ? 'Pause' : 'Start'}
        </button>

        <button onClick={resetScroll} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>

        <button onClick={() => { setMirror(!mirror); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${mirror ? 'text-green-400 bg-green-500/10' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}>
          <FlipHorizontal2 className="w-3.5 h-3.5" /> Mirror
        </button>

        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          {([
            { key: 'left', icon: AlignLeft, title: 'Align left' },
            { key: 'center', icon: AlignCenter, title: 'Align center' },
            { key: 'right', icon: AlignRight, title: 'Align right' },
          ] as const).map(({ key, icon: Icon, title }) => (
            <button key={key} title={title} onClick={() => setTextAlign(key)}
              className={`p-1.5 rounded-md transition-colors ${textAlign === key ? 'text-green-400 bg-green-500/20' : 'text-white/50 hover:text-white/80 hover:bg-white/10'}`}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-white/50 text-sm ml-2">
          <span>Speed:</span>
          <input type="range" min="-10" max="10" step="0.5" value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-28 accent-green-500" />
          <span className="text-white/70 w-12">
            {speed.toFixed(1)}{speed < 0 ? ' ◀' : speed > 0 ? ' ▶' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2 text-white/50 text-sm ml-2">
          <span>Font:</span>
          <input type="range" min="18" max="96" step="2" value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-24 accent-green-500" />
          <span className="text-white/70 w-8">{fontSize}px</span>
        </div>

        <div className="flex items-center gap-2 text-white/50 text-sm ml-2">
          <span>Spacing:</span>
          <input type="range" min="1.2" max="2.5" step="0.1" value={lineSpacing}
            onChange={(e) => setLineSpacing(Number(e.target.value))}
            className="w-24 accent-green-500" />
          <span className="text-white/70 w-8">{lineSpacing.toFixed(1)}</span>
        </div>

         <div className="flex items-center gap-2 ml-auto">
           <button onClick={() => setShowHistory(!showHistory)}
             className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors">
             <History className="w-3.5 h-3.5" /> Scripts
           </button>
           <Link to="/teleprompter" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white/60 transition-colors">
             <ArrowLeft className="w-3.5 h-3.5" /> All Scripts
           </Link>
           <button onClick={() => setShowGuide(true)}
             className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors">
             <BookOpen className="w-3.5 h-3.5" /> Guide
           </button>
         </div>
      </div>

      {!controlsVisible && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
          <button onClick={scrolling ? stopScroll : startScroll}
            disabled={finishState === 'done'}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors disabled:opacity-50 shadow-lg"
            style={{ backgroundColor: scrolling ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)', color: scrolling ? '#f87171' : '#4ade80' }}>
            {scrolling ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {scrolling ? 'Pause' : 'Start'}
          </button>
          <button onClick={showOptions}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm text-white/70 bg-white/10 hover:bg-white/20 transition-colors shadow-lg">
            <Settings2 className="w-4 h-4" /> Options
          </button>
        </div>
      )}
    </div>
  );
}
