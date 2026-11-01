// Markup for the live demo: the sign-in dialog and the full-screen 3D overlay. It stays hidden until a visitor opens
// the demo; demo-app.ts fills it in and drives it by element id.
export function DemoOverlay() {
  return (
    <>
      <dialog className="dl" id="demoLogin" aria-labelledby="dlTitle">
        <form id="dlForm" autoComplete="off">
          <button className="x" type="button" id="dlClose" aria-label="Close">
            ✕
          </button>
          <span className="eyebrow">AutoSalesCity · live demo</span>
          <h3 id="dlTitle">Sign in to the demo city</h3>
          <div className="demo-creds">
            <span>Public demo login</span>
            <b>
              Username: <code>demo</code>
            </b>
            <b>
              Password: <code>autosales</code>
            </b>
          </div>
          <label htmlFor="dlUser">Username</label>
          <input id="dlUser" defaultValue="demo" autoCapitalize="none" spellCheck={false} required />
          <label htmlFor="dlPw">Password</label>
          <input id="dlPw" type="password" defaultValue="autosales" required />
          <button className="btn primary" type="submit" style={{ justifyContent: 'center', marginTop: 8 }}>
            Enter the demo city →
          </button>
          <p className="err" id="dlErr" role="alert" />
          <p className="fine">Demo only: dealerships, people, cars and numbers are fictional. No real customer data.</p>
        </form>
      </dialog>

      <div id="demoApp" className="hidden" data-theme="light" role="dialog" aria-label="AutoSalesCity live demo">
        <div id="dScene" className="d-scene" aria-label="3D demo city" />
        <div className="d-loading" id="dLoading">
          <span />
          Building the demo city…
        </div>
        <header className="d-top">
          <div className="d-brand">
            <span className="d-mark">AS</span>
            <span>
              AutoSales<b>City</b>
            </span>
            <span className="d-live">LIVE DEMO</span>
          </div>
          <div className="d-where" id="dWhere">
            City overview
          </div>
          <div className="d-right">
            <div className="seg" id="dTod" role="group" aria-label="Light">
              <button data-tod="day" title="Day">
                ☀ <span>Day</span>
              </button>
              <button data-tod="evening" title="Evening">
                ◐ <span>Evening</span>
              </button>
              <button data-tod="night" title="Night">
                ☾ <span>Night</span>
              </button>
            </div>
            <button className="d-btn" id="dTour" type="button">
              ▶ Tour
            </button>
            <button className="d-btn" id="dExit" type="button" title="Back to the page (Esc)">
              ✕ Exit
            </button>
          </div>
        </header>
        <nav className="d-visit" id="dVisit" aria-label="Visit a building" />
        <aside className="d-info" id="dInfo" aria-live="polite">
          <button className="d-info-toggle" id="dInfoToggle" type="button" aria-label="Show or hide details">
            i
          </button>
          <div className="d-info-body">
            <div className="d-tag" id="dTag">
              AutoSalesCity
            </div>
            <h2 id="dTitle">City overview</h2>
            <p id="dText" />
            <h3>Sales automations at work</h3>
            <ul id="dList" />
            <h3>
              City feed <span className="dot-live" />
            </h3>
            <ul className="feed" id="dFeed" />
          </div>
        </aside>
        <div className="d-hint" id="dHint">
          Drag to look around · scroll to zoom · click any screen to open it
        </div>
        <div className="navpad" role="toolbar" aria-label="Move the camera">
          <button data-nav="zin" title="Zoom in (+)">
            +
          </button>
          <button data-nav="up" title="Tilt up (↑)">
            ▲
          </button>
          <button data-nav="zout" title="Zoom out (−)">
            −
          </button>
          <button data-nav="left" title="Rotate left (←)">
            ⟲
          </button>
          <button data-nav="home" title="Back to this place's view (R)">
            ⌂
          </button>
          <button data-nav="right" title="Rotate right (→)">
            ⟳
          </button>
          <button data-nav="spin" title="Slow orbit on/off">
            ◎
          </button>
          <button data-nav="down" title="Tilt down (↓)">
            ▼
          </button>
          <button data-nav="city" title="City overview">
            🏙
          </button>
        </div>
        <dialog className="screen-dlg" id="dScrDlg">
          <div className="dlg-head">
            <b id="dScrTitle">Screen</b>
            <button className="d-btn" id="dScrClose" type="button">
              Close ✕
            </button>
          </div>
          <canvas id="dScrCanvas" width="1280" height="600" />
          <p className="d-fine">Live demo screen · updates as the agents work</p>
        </dialog>
      </div>
    </>
  );
}
