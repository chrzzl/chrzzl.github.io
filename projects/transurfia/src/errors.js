// ============================================================================
// ERROR REPORTING BRIDGE
// ============================================================================
//
// The one place the application is allowed to know about preflight.js.
//
// preflight.js has to be a classic script — it reports "this browser cannot
// load modules", which a module could not do — so it cannot be imported, and
// publishes itself on `window.Transurfia` instead. Rather than let that global
// appear in app.js and main.js, it is wrapped here: the rest of the code calls
// three ordinary functions and never touches window.
//
// Every function degrades to something sensible when the preflight is absent,
// so a page that includes the modules without it (a bare dev harness, a test)
// still runs instead of throwing on a missing global.

function preflight() {
  return (typeof window !== 'undefined' && window.Transurfia) || null;
}

// Did the environment pass? False means preflight.js has already put an
// explanation on screen and the application must not start.
//
// Absent preflight counts as a pass: the checks are a courtesy to the user, not
// a licence the app needs in order to run.
export function preflightPassed() {
  const p = preflight();
  return !p || typeof p.ok !== 'function' ? true : p.ok();
}

// The application is alive. Cancels the startup watchdog, which would otherwise
// conclude from the silence that loading had failed.
export function reportReady() {
  const p = preflight();
  if (p && typeof p.ready === 'function') p.ready();
}

// The application failed after the environment had passed. `code` selects the
// wording (see LATE_FAILURES in preflight.js); `error` goes to the console only.
//
// Users get a sentence about what happened and what to try. They do not get a
// stack trace: it tells them nothing they can act on, and it reads like a crash
// rather than like a limitation. The real error is one keystroke away in the
// console for anyone who wants it.
export function reportFailure(code, error) {
  const p = preflight();
  if (p && typeof p.fail === 'function') p.fail(code, error);
  else console.error(`[transurfia] ${code}:`, error);
}
