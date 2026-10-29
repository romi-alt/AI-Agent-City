// @ts-nocheck
// The live demo on the front page: sign-in dialog, full-screen overlay, places, guided tour, camera pad, light/dark.
// Ported from the AutoSalesCity design file. The 3D engine (./engine) is imported only when a visitor opens the demo.
// Everything it starts is undone by the function initDemo returns.
import { prefersReducedMotion } from './landing';

const AGENTS = {
  max: {
    name: 'Max',
    short: 'CEO',
    role: 'Sales manager · reports daily',
    color: '#f5b83d',
    desc: 'Runs the floor: hands out leads, reviews the pipeline every morning and sends the owner a daily report.',
  },
  vera: {
    name: 'Vera',
    short: 'Closer',
    role: 'Internet closer (AI BDC)',
    color: '#ff6b5e',
    desc: 'Answers every new lead in under a minute by text and email, qualifies them and books the appointment.',
  },
  nico: {
    name: 'Nico',
    short: 'Follow-up',
    role: 'Follow-up & aged leads',
    color: '#818cf8',
    desc: 'Follows up with everyone who went quiet: up to 3 personal messages, then lets them go politely.',
  },
  luna: {
    name: 'Luna',
    short: 'Content',
    role: 'Content & social',
    color: '#e879f9',
    desc: 'Plans a week of videos and posts, writes the scripts and sends them for approval.',
  },
  teo: {
    name: 'Teo',
    short: 'Ads',
    role: 'Ads & funnels',
    color: '#38bdf8',
    desc: 'Tracks where leads come from and what they cost, and writes new ad variations to test.',
  },
  iris: {
    name: 'Iris',
    short: 'Care',
    role: 'Customer care',
    color: '#2dd4bf',
    desc: 'Welcomes every new customer, answers questions and asks for the review.',
  },
  dante: {
    name: 'Dante',
    short: 'Partners',
    role: 'Dealer partnerships',
    color: '#fb923c',
    desc: 'Reaches out to partner dealerships. Every message waits for your OK before it goes out.',
  },
};
const HQ_SUBS = [
  ['overview', 'Sales floor'],
  ['ceo', 'CEO desk'],
  ['owner', 'Owner desk'],
  ['crm', 'CRM wall'],
  ['content', 'Content wall'],
  ['dash', 'Live screen'],
];
const DEALER_SUBS = [
  ['outside', 'Lot & sign'],
  ['showroom', 'Showroom'],
  ['board', 'Sales board'],
  ['laptop', 'Sales desk'],
  ['bdc', 'AI BDC screen'],
];
const FL_SUBS = {
  river: [
    ['walk', 'Hudson riverwalk'],
    ['bridge', 'Cable-stayed bridge'],
    ['boats', 'Ferries & tugboats'],
  ],
  skyline: [
    ['skyline', 'Midtown skyline'],
    ['towers', 'Among the towers'],
    ['green', 'The green block'],
  ],
  times: [['times', 'The big screens']],
  beach: [
    ['beach', 'Piers & harbor'],
    ['ocean', 'Ferries & ships'],
  ],
};
const FL_PLACES = [
  {
    id: 'river',
    name: 'Hudson riverwalk & bridges',
    sub: 'Piers, ferries, East River bridges',
    c: '#3d7586',
    icon: '≈',
    tag: 'Waterfront',
    text: 'The Hudson riverwalk runs past a row of piers, with ferries and tugboats on the water and cable-stayed and arch bridges over the East River. Every block along it is room for another client building.',
    list: [
      'Room for 100+ client buildings on one map',
      'Each client keeps its own CRM, leads and brand',
      'Agency view across every district at once',
    ],
  },
  {
    id: 'skyline',
    name: 'Midtown skyline',
    sub: 'Setback towers and spires',
    c: '#7b8998',
    icon: '▲',
    tag: 'Tower district',
    text: 'Art-deco spires and glass towers rise over Midtown, with a green block of plane trees to the north: this is where dealer groups and agencies grow from one showroom to a whole tower of floors.',
    list: [
      'One floor per salesperson or store',
      'Dealer groups get a tower with a floor per store',
      'Lit windows show agents working at night',
    ],
  },
  {
    id: 'times',
    name: 'Times Square screens',
    sub: 'Big rotating billboards',
    c: '#e5484d',
    icon: '◧',
    tag: 'Junction of lights',
    text: 'Four corner towers carry big lit screens that rotate their ads every few seconds. Your dealership can have a screen of its own.',
    list: ['Ads rotate every 7 seconds', 'Brighter after dark', 'Fictional demo ads only'],
  },
  {
    id: 'beach',
    name: 'Harbor & piers',
    sub: 'Piers, ferries, the open harbor',
    c: '#2f5f8f',
    icon: '⚓',
    tag: 'Harbor',
    text: 'The island ends in an open harbor with a container ship, sailboats and ferries crossing to the fort island. Switch to Night to watch the whole waterfront light up.',
    list: [
      'Day, Evening and Night lighting',
      'Boats, planes, traffic and people move live',
      'Built to show clients their building in a living city',
    ],
  },
];
const TOUR = [
  ['city'],
  ['hq', 'overview'],
  ['hq', 'crm'],
  ['aurora', 'outside'],
  ['aurora', 'showroom'],
  ['aurora', 'board'],
  ['river', 'walk'],
  ['times', 'times'],
  ['river', 'bridge'],
  ['vanta', 'showroom'],
  ['vanta', 'laptop'],
  ['skyline', 'skyline'],
  ['summit', 'outside'],
  ['summit', 'showroom'],
  ['beach', 'beach'],
  ['volta', 'showroom'],
  ['volta', 'bdc'],
  ['beach', 'ocean'],
  ['hq', 'ceo'],
];
const LINES = {
  vera: [
    'Replied to a new F&I course lead in 34 s',
    'Booked an enrollment call for 4:30 PM',
    'Answered a pricing question by text',
    'Sent the free chapter to a new lead',
  ],
  nico: [
    'Followed up with 6 quiet leads',
    'Revived a lead from last month',
    'Closed out 2 leads politely after 3 tries',
  ],
  max: ['Morning report sent to the owner', 'Assigned 4 new leads to Vera', 'Enrollment goal at 64% with 10 days left'],
  luna: ["Drafted Wednesday's reel script", 'Sent 3 posts for approval'],
  teo: ['Cost per lead down 12% this week', 'Wrote 4 new ad variations'],
  iris: ['Welcomed 2 new students', 'Sent class reminders for tomorrow'],
  dante: ['Drafted a partner email for approval'],
};

export function initDemo() {
  const $ = s => document.querySelector(s);
  const esc = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const REDUCED = prefersReducedMotion();
  const MOBILE = innerWidth < 900;
  const store = {
    get: k => {
      try {
        return sessionStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        sessionStorage.setItem(k, v);
      } catch {
        /* private mode: nothing remembered */
      }
    },
  };
  const offs = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    offs.push(() => target.removeEventListener(type, fn));
  };

  let PLACES = [];
  let office,
    world,
    florida,
    booted = false,
    current = { place: 'city', sub: null },
    tourOn = false,
    tourT = null,
    disposed = false;
  const timers = [];

  /* ---------- login dialog (the design's public demo login) ---------- */
  const dlg = $('#demoLogin');
  document.querySelectorAll('[data-open-demo]').forEach(b =>
    on(b, 'click', e => {
      e.preventDefault();
      if (store.get('asc-demo') === '1') openDemo();
      else {
        $('#dlErr').textContent = '';
        dlg.showModal();
      }
    }),
  );
  on($('#dlClose'), 'click', () => dlg.close());
  on(dlg, 'click', e => {
    if (e.target === dlg) dlg.close();
  });
  on($('#dlForm'), 'submit', e => {
    e.preventDefault();
    if ($('#dlUser').value.trim().toLowerCase() === 'demo' && $('#dlPw').value === 'autosales') {
      store.set('asc-demo', '1');
      dlg.close();
      openDemo();
    } else $('#dlErr').textContent = 'Use the public demo login: demo / autosales';
  });

  /* ---------- open / close the demo overlay ---------- */
  async function openDemo() {
    $('#demoApp').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    window.__ascDemoOpen = true;
    window.dispatchEvent(new CustomEvent('asc:demo', { detail: { open: true } }));
    if (office) {
      office.paused = false;
      office.resize();
      return;
    }
    if (booted) return;
    booted = true;
    try {
      // The scene paints text onto canvas textures: have the fonts ready first so it does not fall back to a system font.
      await Promise.all(
        ['700 16px "Space Grotesk"', '800 16px "Space Grotesk"', '500 16px Inter', '700 16px "JetBrains Mono"'].map(f =>
          document.fonts.load(f),
        ),
      );
      const { Office3D, DemoWorld, DEALERS, Florida } = await import('./engine');
      if (disposed) return;
      PLACES = [
        {
          id: 'city',
          name: 'City overview',
          sub: 'The whole demo district',
          c: '#64748b',
          icon: '◎',
          tag: 'AutoSalesCity · demo district',
          text: 'Every building is a client and every lit desk is an agent at work. Fly between the dealerships, then step into the Fast Sales HQ where the AI sales team works.',
          list: [
            'Dealerships and the Fast Sales HQ in the middle',
            'Each building keeps its own CRM, leads and brand',
            'Midtown towers, bridges, ferries, taxis and planes run live',
            'Switch Day, Evening and Night at the top',
          ],
        },
        {
          id: 'hq',
          name: 'Fast Sales Training Center',
          sub: 'HQ · the AI sales team',
          c: '#f5b83d',
          icon: 'FS',
          tag: 'Headquarters · floor L4',
          text: 'Seven AI agents run the sales department of a training center: Vera answers every new lead in under a minute, Nico follows up, and Max reports to the owner each morning.',
          list: [
            'New lead → personal text and email in under 60 s',
            'Follow-ups that stop the moment the lead replies',
            'Daily pipeline report to the owner at 8 AM',
            'Content plan approved with one tap',
            'Anything risky waits for a human yes',
          ],
        },
        ...DEALERS.map(d => ({
          id: d.id,
          name: d.short,
          sub: d.tag,
          c: d.color,
          icon: d.name[0],
          tag: 'Dealership · ' + d.tag,
          text: `${d.short} runs its internet sales department on AutoSalesCity. Watch the sales board, the AI BDC screen and the salesperson's screen update as leads come in.`,
          list: [
            'Internet leads answered by Vera in under 60 s',
            'Test drives booked straight into the CRM calendar',
            'Sales board updates itself as deals move',
            'Aged leads revived by Nico',
            'Review requests sent by Iris after delivery',
          ],
        })),
        ...FL_PLACES,
      ];
      office = new Office3D($('#dScene'), {
        agentsInfo: AGENTS,
        reducedMotion: REDUCED,
        timeZone: 'America/New_York',
        onSelect,
        cityOpts: {
          demo: {
            skipFront: [
              [56, 90],
              [-90, -56],
            ],
          },
        },
        maxDistance: 900,
      });
      office.build({
        agents: Object.keys(AGENTS),
        human: { name: 'Elvis', role: 'Owner' },
        floorLabel: 'L4',
        showCeo: true,
        available: false,
      });
      world = new DemoWorld(office, { mobile: MOBILE });
      office.extras.push(world);
      florida = new Florida(office, { mobile: MOBILE });
      office.extras.push(florida);
      office.onSpin = on => setSpin(on);
      fillOffice();
      setTod(store.get('asc-tod') || 'day');
      renderVisit();
      go('city');
      $('#dLoading').classList.add('hidden');
      timers.push(
        setTimeout(() => {
          const h = $('#dHint');
          if (h) h.style.opacity = 0;
        }, 9000),
      );
      for (let i = 0; i < 4; i++) feed(world.event());
      timers.push(
        setInterval(
          () => {
            if (!office.paused) feed(world.event());
          },
          REDUCED ? 6000 : 2600,
        ),
      );
      timers.push(
        setInterval(
          () => {
            if (!office.paused) officeChatter();
          },
          REDUCED ? 8000 : 4200,
        ),
      );
      timers.push(
        setInterval(() => {
          if ($('#dScrDlg').open) copyScreen();
        }, 500),
      );
    } catch (err) {
      console.error(err);
      $('#dLoading').innerHTML =
        '<span></span>The 3D demo needs a modern browser with WebGL and an internet connection.';
    }
  }
  function closeDemo() {
    stopTour();
    if (office) office.paused = true;
    $('#demoApp').classList.add('hidden');
    document.body.style.overflow = '';
    window.__ascDemoOpen = false;
    window.dispatchEvent(new CustomEvent('asc:demo', { detail: { open: false } }));
  }
  on($('#dExit'), 'click', closeDemo);

  /* ---------- mock data for the HQ office screens ---------- */
  const K = { leadsToday: 18, booked24h: 7, enrolledMonth: 9, replySeconds: 38 };
  const PIPE = [
    ['new', 'New lead', 23],
    ['contacted', 'Contacted', 41],
    ['booked', 'Call booked', 17],
    ['enrolled', 'Training started', 9],
    ['active', 'Active student', 26],
    ['completed', 'Completed / placed', 12],
  ];
  const pipeline = () => ({ pipeline: PIPE.map(([key, label, count]) => ({ key, label, count })) });
  function fillOffice() {
    office.drawCRM(pipeline());
    office.drawDash(K);
    office.drawContent(
      [
        {
          day: 'Mon',
          format: 'Reel',
          title: '3 phrases that kill a car deal (and what to say instead)',
          status: 'approved',
        },
        { day: 'Tue', format: 'Carousel', title: 'F&I manager: a day on the job', status: 'approved' },
        { day: 'Wed', format: 'Short video', title: 'How to handle "I need to think about it"', status: 'pending' },
        { day: 'Thu', format: 'Post', title: 'Graduate story: from lot porter to closer', status: 'approved' },
        { day: 'Fri', format: 'Reel', title: 'The 60-second follow-up rule', status: 'pending' },
        { day: 'Sat', format: 'Live', title: 'Q&A: getting hired at a dealership', status: 'changes' },
        { day: 'Sun', format: 'Post', title: 'Weekend test-drive script', status: 'pending' },
      ],
      'demo week',
    );
  }
  function officeChatter() {
    const key = pick(Object.keys(LINES)),
      txt = pick(LINES[key]);
    office.say(key, txt, 6500, key !== 'max' && Math.random() < 0.3);
    if (key === 'vera') {
      K.leadsToday++;
      office.drawDash(K);
      PIPE[1][2]++;
      office.drawCRM(pipeline());
    }
    feed({
      who: AGENTS[key].name,
      txt: txt.charAt(0).toLowerCase() + txt.slice(1),
      where: 'Fast Sales HQ',
      col: AGENTS[key].color,
    });
  }
  function feed(l) {
    if (!l) return;
    const ul = $('#dFeed');
    const li = document.createElement('li');
    li.style.setProperty('--c', l.col);
    li.innerHTML = `<i></i><span><b>${esc(l.who)}</b> ${esc(l.txt)} <em>· ${esc(l.where)}</em></span>`;
    ul.prepend(li);
    while (ul.children.length > 6) ul.lastChild.remove();
  }

  /* ---------- navigation ---------- */
  function renderVisit() {
    const v = $('#dVisit');
    v.innerHTML =
      `<h4>Visit the city</h4>` +
      PLACES.map(p => {
        const subs = p.id === 'city' ? [] : p.id === 'hq' ? HQ_SUBS : FL_SUBS[p.id] || DEALER_SUBS;
        const isOn = current.place === p.id;
        return (
          `<button class="place ${isOn ? 'on' : ''}" data-place="${p.id}" style="--c:${p.c}"><i>${esc(p.icon)}</i><span><b>${esc(p.name)}</b><small>${esc(p.sub)}</small></span></button>` +
          (isOn && subs.length
            ? `<div class="subs" style="--c:${p.c}">${subs.map(([k, l]) => `<button data-sub="${k}" class="${current.sub === k ? 'on' : ''}">${l}</button>`).join('')}</div>`
            : '')
        );
      }).join('');
    if (MOBILE) v.querySelector('.place.on')?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' });
    v.querySelectorAll('[data-place]').forEach(b => {
      b.onclick = () => {
        stopTour();
        go(b.dataset.place);
      };
    });
    v.querySelectorAll('[data-sub]').forEach(b => {
      b.onclick = () => {
        stopTour();
        go(current.place, b.dataset.sub);
      };
    });
  }
  function go(place, sub) {
    const p = PLACES.find(x => x.id === place) || PLACES[0];
    sub =
      sub ||
      (place === 'hq' ? 'overview' : place === 'city' ? null : FL_SUBS[place] ? FL_SUBS[place][0][0] : 'showroom');
    current = { place, sub };
    if (place === 'city') {
      const [pos, tgt] = florida.view('aerial');
      office.flyTo(pos, tgt);
      setSpin(office.spin(false));
      timers.push(
        setTimeout(() => {
          if (current.place === 'city' && !office.camGoal) setSpin(office.spin(!REDUCED));
        }, 3000),
      );
    } else if (FL_SUBS[place]) {
      setSpin(office.spin(false));
      const [pos, tgt] = florida.view(sub);
      office.flyTo(pos, tgt);
    } else if (place === 'hq') {
      setSpin(office.spin(false));
      office.view(sub);
    } else {
      setSpin(office.spin(false));
      const [pos, tgt] = world.view(place, sub);
      office.flyTo(pos, tgt);
    }
    const subLabel = (place === 'hq' ? HQ_SUBS : FL_SUBS[place] || DEALER_SUBS).find(([k]) => k === sub)?.[1];
    $('#dWhere').textContent = p.name + (subLabel && place !== 'city' ? ' · ' + subLabel : '');
    $('#dInfo').style.setProperty('--c', p.c);
    $('#dTag').textContent = p.tag;
    $('#dTitle').textContent = p.name;
    $('#dText').textContent = p.text;
    $('#dList').innerHTML = p.list.map(x => `<li>${esc(x)}</li>`).join('');
    renderVisit();
  }
  function onSelect(key) {
    stopTour();
    if (key.startsWith('demo:')) {
      const [, kind, id, i] = key.split(':');
      const S = world.dealers[id];
      if (kind === 'board') openScreen(S.board.c, `${S.D.short} · Sales board`);
      if (kind === 'bdc') openScreen(S.bdc.c, `${S.D.short} · AI BDC live conversations`);
      if (kind === 'laptop') openScreen(S.laptops[+i].c, `${S.D.short} · Sales desk screen`);
      return;
    }
    if (key.startsWith('view:')) {
      const v = key.slice(5);
      current = { place: 'hq', sub: v };
      renderVisit();
      const src = { crm: office.crmTex?.c, content: office.contentTex?.c, dash: office.dashTex?.c }[v];
      if (src)
        openScreen(
          src,
          {
            crm: 'Fast Sales HQ · CRM wall',
            content: 'Fast Sales HQ · Content wall',
            dash: 'Fast Sales HQ · Live screen',
          }[v],
        );
      return;
    }
    const a = AGENTS[key];
    if (a) {
      $('#dTag').textContent = 'AI agent · Fast Sales HQ';
      $('#dTitle').textContent = `${a.name} · ${a.role}`;
      $('#dText').textContent = a.desc;
      $('#dInfo').style.setProperty('--c', a.color);
    } else if (key === 'owner') {
      $('#dTag').textContent = 'Human · Fast Sales HQ';
      $('#dTitle').textContent = 'Elvis · Owner';
      $('#dText').textContent =
        "The owner approves what matters and gets Max's report every morning. Everything else runs on its own.";
    }
  }

  /* ---------- screen viewer ---------- */
  let scrSrc = null;
  function openScreen(canvas, title) {
    scrSrc = canvas;
    const out = $('#dScrCanvas');
    out.width = canvas.width;
    out.height = canvas.height;
    $('#dScrTitle').textContent = title;
    copyScreen();
    if (!$('#dScrDlg').open) $('#dScrDlg').showModal();
  }
  function copyScreen() {
    if (scrSrc) $('#dScrCanvas').getContext('2d').drawImage(scrSrc, 0, 0);
  }
  on($('#dScrClose'), 'click', () => $('#dScrDlg').close());
  on($('#dScrDlg'), 'click', e => {
    if (e.target === $('#dScrDlg')) $('#dScrDlg').close();
  });

  /* ---------- light / dark ---------- */
  function setTod(t) {
    office.setTimeOfDay(t);
    store.set('asc-tod', t);
    $('#demoApp').dataset.theme = t === 'day' ? 'light' : 'dark';
    document.querySelectorAll('#dTod button').forEach(b => b.classList.toggle('on', b.dataset.tod === t));
  }
  document.querySelectorAll('#dTod button').forEach(b => on(b, 'click', () => office && setTod(b.dataset.tod)));

  /* ---------- guided tour ---------- */
  function startTour() {
    if (!office) return;
    tourOn = true;
    $('#dTour').classList.add('on');
    $('#dTour').textContent = '❚❚ Tour';
    let i = 0;
    const next = () => {
      const [p, s] = TOUR[i++ % TOUR.length];
      go(p, s);
    };
    next();
    tourT = setInterval(next, 8000);
  }
  function stopTour() {
    if (!tourOn) return;
    tourOn = false;
    clearInterval(tourT);
    $('#dTour').classList.remove('on');
    $('#dTour').textContent = '▶ Tour';
  }
  on($('#dTour'), 'click', () => (tourOn ? stopTour() : startTour()));
  on($('#dScene'), 'pointerdown', stopTour);

  /* ---------- camera pad + keys ---------- */
  function setSpin(isOn) {
    $('#demoApp [data-nav=spin]')?.classList.toggle('on', !!isOn);
    return isOn;
  }
  function nav(a) {
    if (!office) return;
    if (a === 'zin') office.zoom(1);
    else if (a === 'zout') office.zoom(-1);
    else if (a === 'left') office.rotate(-1);
    else if (a === 'right') office.rotate(1);
    else if (a === 'up') office.tilt(-1);
    else if (a === 'down') office.tilt(1);
    else if (a === 'home') go(current.place, current.sub);
    else if (a === 'spin') setSpin(office.spin());
    else if (a === 'city') go('city');
  }
  document.querySelectorAll('#demoApp .navpad [data-nav]').forEach(b =>
    on(b, 'click', () => {
      stopTour();
      nav(b.dataset.nav);
    }),
  );
  on(window, 'keydown', e => {
    if (!window.__ascDemoOpen) return;
    if (e.key === 'Escape' && !$('#dScrDlg').open) {
      closeDemo();
      return;
    }
    if (!office || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA/.test(e.target.tagName) || $('#dScrDlg').open)
      return;
    const k = {
      '+': 'zin',
      '=': 'zin',
      '-': 'zout',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      r: 'home',
      R: 'home',
      c: 'city',
      C: 'city',
    }[e.key];
    if (k) {
      e.preventDefault();
      stopTour();
      nav(k);
    }
  });
  on($('#dInfoToggle'), 'click', () => $('#dInfo').classList.toggle('open'));
  if (location.hash === '#live-demo' && store.get('asc-demo') === '1') openDemo();

  return () => {
    disposed = true;
    stopTour();
    timers.forEach(t => {
      clearInterval(t);
      clearTimeout(t);
    });
    offs.forEach(f => f());
    if (office) office.dispose();
    if (window.__ascDemoOpen) {
      document.body.style.overflow = '';
      window.__ascDemoOpen = false;
    }
  };
}
