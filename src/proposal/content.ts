/**
 * Everything the proposal page says, in English and Spanish. Edit wording, prices and names here;
 * building and agent counts come from the city data itself.
 */
export type Lang = 'en' | 'es';
export interface T { en: string; es: string }
const t = (en: string, es: string): T => ({ en, es });

export const P = {
  from: { company: 'Blockz Digital Business', site: 'GetWeb.Solutions' },
  date: t('October 27, 2026', '27 de octubre de 2026'),
  validDays: 15,
  client: { name: 'Elvis Rodríguez', company: 'Fast Sales Training Center', username: 'elvis' },
  signatures: [
    { name: 'Armando Benítez', org: 'Blockz Digital Business LLC · GetWeb.Solutions', contact: 'benitezdesigner@gmail.com' },
    { name: 'Elvis Rodríguez', org: 'Fast Sales Training Center', contact: '' },
  ],
  footer: t(
    'Blockz Digital Business LLC · Dallas, TX · Proposal prepared for Fast Sales Training Center · Dashboard figures come from the Sales City simulation and are sample data.',
    'Blockz Digital Business LLC · Dallas, TX · Propuesta preparada para Fast Sales Training Center · Las cifras del panel vienen de la simulación de Sales City y son de ejemplo.',
  ),

  hero: {
    eyebrow: t('For Elvis Rodríguez · Fast Sales Training Center', 'Para Elvis Rodríguez · Fast Sales Training Center'),
    title: [t('Your sales city', 'Tu ciudad de ventas'), t('never sleeps.', 'nunca duerme.')],
    lead: t(
      'Fifteen buildings, one city: your Training Center, nine dealerships, Rick Case Honda’s sales associates and three rental towers. AI agents work every floor by email, phone and text, inside your GHL. They answer every lead, book the calls and fill the floors. You approve; they sell.',
      'Quince edificios, una ciudad: tu Training Center, nueve dealers, los vendedores de Rick Case Honda y tres torres de renta. Agentes de IA trabajan cada piso por email, teléfono y texto, dentro de tu GHL. Responden cada lead, agendan las llamadas y llenan los pisos. Tú apruebas; ellos venden.',
    ),
    cta: t('Enter Sales City →', 'Entrar a Sales City →'),
    cta2: t('See the investment', 'Ver la inversión'),
    gauge: t('AI agent desks in the city', 'puestos de agentes de IA en la ciudad'),
    stats: [
      { v: t('{agents} agents', '{agents} agentes'), l: t('on every floor of the city', 'en cada piso de la ciudad') },
      { v: t('$1,200', '$1,200'), l: t('one-time setup', 'setup único') },
      { v: t('≈ $800 / mo', '≈ $800 / mes'), l: t('office + AI tokens', 'oficina + tokens de IA') },
    ],
  },

  found: {
    eyebrow: t('What we found', 'Lo que vimos'),
    title: [t('You have the product.', 'Tienes el producto.'), t('You need the machine that sells it.', 'Falta la máquina que lo venda.')],
    lead: t(
      'We reviewed fastsalestrainingcenter.com. You teach auto sales techniques and your GHL is already installed and built out. That is half the work. Here is what we see for the other half.',
      'Revisamos fastsalestrainingcenter.com. Enseñas técnicas de venta de autos y ya tienes GHL instalado y desarrollado. Eso es la mitad del trabajo. Esto es lo que vemos para la otra mitad.',
    ),
    cards: [
      { tag: t('Urgent', 'Urgente'), tone: 'red',
        h: t('The site’s security certificate has expired.', 'El certificado de seguridad del sitio está vencido.'),
        p: t('Browsers warn that the connection is not secure before anyone sees your offer, and many visitors leave right there. We renew it during setup.',
          'El navegador avisa que la conexión no es segura antes de que alguien vea tu oferta. Muchos visitantes se van ahí mismo. Lo dejamos renovado en el setup.') },
      { tag: t('Opportunity', 'Oportunidad'), tone: 'amber',
        h: t('Every click on your enroll buttons deserves an answer in under a minute.', 'Cada clic en tus botones de inscripción merece una respuesta en menos de un minuto.'),
        p: t('Your site already invites people to enroll. The agents make sure nobody waits: Vera calls or texts right away, books the demo class and Nico follows up until they decide.',
          'Tu sitio ya invita a inscribirse. Los agentes se aseguran de que nadie espere: Vera llama o escribe de inmediato, agenda la clase demo y Nico da seguimiento hasta que decidan.') },
      { tag: t('In your favor', 'A favor'), tone: 'green',
        h: t('Your GHL is ready and you have dealer connections.', 'Tu GHL ya está listo y tienes contactos en dealers.'),
        p: t('The agents work on top of what you already have. Every dealer you talk to is a training client, a building in the city and a source of salespeople who need their own office.',
          'Los agentes trabajan sobre lo que ya tienes. Cada dealer con el que hablas es un cliente de entrenamiento, un edificio en la ciudad y una fuente de vendedores que necesitan su propia oficina.') },
    ],
  },

  team: {
    eyebrow: t('Your team · Leadership floor, L12', 'Tu equipo · Piso de dirección, L12'),
    title: [t('One CEO and six agents', 'Un CEO y seis agentes'), t('working for Fast Sales.', 'trabajando para Fast Sales.')],
    lead: t(
      'Your office is the top floor of the Fast Sales Training Center, in the middle of Sales City. Each agent has a desk, a computer connected to your CRM and one clear job. Max runs the team and reports only to you.',
      'Tu oficina es el último piso del Fast Sales Training Center, en el centro de Sales City. Cada agente tiene su escritorio, su computadora conectada a tu CRM y una tarea clara. Max dirige al equipo y te reporta solo a ti.',
    ),
    ceo: {
      tag: t('CEO · head of the team', 'CEO · cabeza del equipo'), name: 'Max',
      p: t('Assigns leads, reviews the pipeline every morning, tracks the monthly enrollment goal and sends you a daily report. Anything that needs your approval (ad budget, a special price for a dealer) reaches you with a yes or no button.',
        'Reparte los leads, revisa el pipeline cada mañana, mide la meta de inscripciones del mes y te entrega un reporte diario. Lo que necesita tu aprobación (presupuesto de anuncios, precios especiales para un dealer) te llega con un botón de sí o no.'),
    },
    agents: [
      { name: 'Vera', role: t('Enrollment closer', 'Closer de inscripciones'), p: t('Answers every lead in under 1 minute, qualifies, books the call and closes the enrollment.', 'Responde cada lead en menos de 1 minuto, califica, agenda la llamada y cierra la inscripción.') },
      { name: 'Nico', role: t('Follow-up and re-engagement', 'Seguimiento y reactivación'), p: t('SMS, WhatsApp and email sequences. Wins back everyone who said “I’ll think about it”.', 'Secuencias por SMS, WhatsApp y email. Recupera a los que dijeron “lo voy a pensar”.') },
      { name: 'Luna', role: t('Content and social', 'Contenido y redes'), p: t('Writes scripts, builds your weekly grid and schedules it in the GHL planner. You approve.', 'Escribe guiones, arma tu grilla semanal y la programa en el planner de GHL. Tú apruebas.') },
      { name: 'Teo', role: t('Ads and funnels', 'Anuncios y embudos'), p: t('Meta and Google campaigns, the free guide landing page, A/B tests and cost per lead.', 'Campañas de Meta y Google, landing de la guía gratuita, pruebas A/B y costo por lead.') },
      { name: 'Iris', role: t('Students and community', 'Alumnos y comunidad'), p: t('Onboarding, course questions, live class reminders and satisfaction surveys.', 'Bienvenida, dudas del curso, recordatorios de clases en vivo y encuestas de satisfacción.') },
      { name: 'Dante', role: t('Dealer partnerships', 'Alianzas con dealers'), p: t('Offers training to sales teams and a virtual office for every salesperson.', 'Ofrece entrenamiento a equipos de venta y una oficina virtual para cada vendedor.') },
    ],
  },

  city: {
    eyebrow: t('Sales City · the whole map', 'Sales City · el mapa completo'),
    title: [t('Fifteen buildings.', 'Quince edificios.'), t('Every floor working.', 'Cada piso trabajando.')],
    lead: t(
      'Your office is one floor of a whole city. Every department of every dealership has its own agents calling, texting and emailing its own customers, and every result rolls up to your dashboard and Max’s daily report.',
      'Tu oficina es un piso de toda una ciudad. Cada departamento de cada dealer tiene sus propios agentes llamando, escribiendo y enviando emails a sus clientes, y cada resultado llega a tu panel y al reporte diario de Max.',
    ),
    groups: {
      training: t('Training Center', 'Training Center'),
      dealership: t('Dealerships', 'Dealers'),
      associates: t('Rick Case Honda associates', 'Vendedores de Rick Case Honda'),
      rental: t('Rental towers', 'Torres de renta'),
    },
    groupInfo: {
      training: t('Courses, dealership packages, books and affiliates, one department per floor.', 'Cursos, paquetes para dealers, libros y afiliados, un departamento por piso.'),
      dealership: t('Sales, BDC, service, parts, finance, marketing and more on every building.', 'Ventas, BDC, servicio, partes, finanzas, marketing y más en cada edificio.'),
      associates: t('One floor and one agent team per sales associate, new and used cars.', 'Un piso y un equipo de agentes por vendedor, autos nuevos y usados.'),
      rental: t('Floors for rent to any salesperson or business that wants its own agents.', 'Pisos en renta para cualquier vendedor o negocio que quiera sus propios agentes.'),
    },
    floors: t('floors', 'pisos'),
    agents: t('agents', 'agentes'),
    forRent: t('for rent', 'en renta'),
  },

  access: {
    eyebrow: t('Your Sales City access', 'Tu acceso a Sales City'),
    title: [t('Walk in and watch your team', 'Entra y mira a tu equipo'), t('work in real time.', 'trabajar en tiempo real.')],
    lead: t(
      'The city is running right now. When you sign in you see your company: your floor, your agents, your CRM and your content. The demo uses sample data; once we connect your GHL you will see your real numbers.',
      'La ciudad está funcionando ahora mismo. Al entrar ves tu empresa: tu piso, tus agentes, tu CRM y tu contenido. La demo usa datos de ejemplo; cuando conectemos tu GHL verás tus números reales.',
    ),
    address: t('Address', 'Dirección'),
    user: t('User', 'Usuario'),
    password: t('Password', 'Clave'),
    passwordNote: t('Sent to you privately, with your authenticator setup', 'Te la enviamos en privado, con la configuración del autenticador'),
    copy: t('Copy', 'Copiar'),
    copied: t('Copied', 'Copiado'),
    open: t('Open my office →', 'Abrir mi oficina →'),
    tips: [
      t('Tap your desk to open your CRM.', 'Toca tu escritorio para abrir tu CRM.'),
      t('The big screen shows your content grid and strategy.', 'La pantalla grande muestra tu grilla y estrategia de contenido.'),
      t('Tap Max or any agent to see what they are working on.', 'Toca a Max o a cualquier agente para ver en qué está trabajando.'),
    ],
    dash: {
      title: t('Live dashboard', 'Panel en vivo'),
      leads: t('Leads today', 'Leads hoy'),
      booked: t('Calls booked · 24h', 'Llamadas agendadas · 24h'),
      enrolled: t('Enrolled this month', 'Inscritos del mes'),
      working: t('Agents working', 'Agentes trabajando'),
      pipeline: t('Enrollment pipeline', 'Pipeline de inscripciones'),
      doing: t('What your team is doing', 'Lo que hace tu equipo'),
      idle: t('Between tasks', 'Entre tareas'),
      waiting: t('Waiting for your OK', 'Esperando tu OK'),
      offline: t('Live numbers are shown only inside your signed-in office. They are never published here.', 'Los números en vivo solo se muestran dentro de tu oficina, con tu sesión iniciada. Nunca se publican aquí.'),
      note: t('Sample layout · your live dashboard stays private', 'Diseño de ejemplo · tu panel en vivo es privado'),
      stages: {
        'New lead': t('New lead', 'Lead nuevo'), 'Contacted': t('Contacted', 'Contactado'), 'Call booked': t('Call booked', 'Llamada agendada'),
        'Training started': t('Training started', 'Inició el curso'), 'Active student': t('Active student', 'Alumno activo'), 'Completed / placed': t('Completed / placed', 'Graduado / colocado'),
      } as Record<string, T>,
    },
  },

  content: {
    eyebrow: t('Content · strategy for Fast Sales', 'Contenido · estrategia para Fast Sales'),
    title: [t('A week of content', 'Una semana de contenido'), t('that ends in enrollments.', 'que termina en inscripciones.')],
    lead: t(
      'A short video every day with real techniques from the sales floor. Every piece leads to one place: the free guide “10 closes the best salespeople use”. From there, Vera takes the lead.',
      'Video corto todos los días con técnicas reales del piso de ventas. Cada pieza lleva a un solo lugar: la guía gratuita “10 cierres que usan los mejores vendedores”. De ahí, Vera toma el lead.',
    ),
    days: [
      { d: t('Mon', 'Lun'), ch: t('TikTok · Reels', 'TikTok · Reels'), h: t('3 lines that close a sale on the floor', '3 frases que cierran una venta en el piso'), pillar: 0 },
      { d: t('Tue', 'Mar'), ch: t('Instagram · carousel', 'Instagram · carrusel'), h: t('How to answer “I’ll think about it”', 'Cómo responder “lo voy a pensar”'), pillar: 0 },
      { d: t('Wed', 'Mié'), ch: t('Live', 'Live'), h: t('Closing roleplay with a student', 'Roleplay de cierre con un alumno'), pillar: 2 },
      { d: t('Thu', 'Jue'), ch: t('Testimonial', 'Testimonio'), h: t('From zero to salesperson at a dealer', 'De cero a vendedor en un dealer'), pillar: 1 },
      { d: t('Fri', 'Vie'), ch: t('Shorts · Reels', 'Shorts · Reels'), h: t('The walk-around in 60 seconds', 'El walk-around en 60 segundos'), pillar: 0 },
      { d: t('Sat', 'Sáb'), ch: t('Stories', 'Stories'), h: t('A day at the Training Center', 'Un día en el Training Center'), pillar: 3 },
      { d: t('Sun', 'Dom'), ch: t('All · LinkedIn', 'Todas · LinkedIn'), h: t('Enrollment open · dealers: train your team', 'Inscripciones abiertas · dealers: entrena a tu equipo'), pillar: 4 },
    ],
    pillars: [
      { n: t('Authority', 'Autoridad'), pct: 35 },
      { n: t('Social proof', 'Prueba social'), pct: 20 },
      { n: t('Community', 'Comunidad'), pct: 15 },
      { n: t('Behind the scenes', 'Detrás de cámaras'), pct: 15 },
      { n: t('Offer and dealers', 'Oferta y dealers'), pct: 15 },
    ],
    stepWord: t('Step', 'Paso'),
    steps: [
      t('A short daily video on TikTok, Reels and Shorts.', 'Video corto diario en TikTok, Reels y Shorts.'),
      t('The video leads to the free guide in your GHL.', 'El video lleva a la guía gratuita en tu GHL.'),
      t('Vera replies in under 1 minute and books the call.', 'Vera responde en menos de 1 minuto y agenda la llamada.'),
      t('A live demo class every week.', 'Clase demo en vivo cada semana.'),
      t('Enrollment, Iris’s welcome and Nico’s follow-up.', 'Inscripción, bienvenida de Iris y seguimiento de Nico.'),
    ],
  },

  price: {
    eyebrow: t('Investment · base price', 'Inversión · precio base'),
    title: [t('The four-square.', 'La hoja de cuatro cuadros.')],
    lead: t('You know it from the sales floor. Here is the whole deal on one sheet, with no fine print.', 'La conoces del piso de ventas. Aquí está todo el trato en una sola hoja, sin letra pequeña.'),
    squares: [
      { tag: t('1 · Virtual office setup', '1 · Setup de tu oficina virtual'), v: '$1,200', unit: t('one time', 'una vez'),
        items: [
          t('Your office in Sales City and your private access', 'Oficina en Sales City y tu acceso privado'),
          t('CEO and 6 agents trained on your business', 'CEO y 6 agentes entrenados con tu negocio'),
          t('Connection to your GHL, pipeline and calendar', 'Conexión con tu GHL, pipeline y calendario'),
          t('Free guide funnel and SSL renewal', 'Embudo de la guía gratuita y renovación del SSL'),
          t('First month’s content grid and strategy', 'Grilla y estrategia del primer mes'),
        ] },
      { tag: t('2 · Monthly: office + tokens', '2 · Mensualidad: oficina + tokens'), v: '≈$800', unit: t('/ mo', '/ mes'),
        items: [
          t('Full department · 6 agents: $399', 'Departamento completo · 6 agentes: $399'),
          t('AI tokens, n8n automations and server: ≈ $400', 'Tokens de IA, automatizaciones n8n y servidor: ≈ $400'),
          t('Live dashboard and Max’s daily report', 'Panel en vivo y reporte diario de Max'),
        ],
        note: t('Token use moves with your lead and conversation volume. If a month is heading over the estimate, we tell you first.', 'Los tokens cambian con el volumen de leads y conversaciones. Si un mes apunta a pasar el estimado, te avisamos antes.') },
      { tag: t('3 · Growth partner', '3 · Growth partner'), v: '%', unit: t('per sale', 'por venta'),
        note: t('We earn a commission on every enrollment or sale the system generates. We set the percentage together. When you win, we win.', 'Ganamos una comisión por cada inscripción o venta que genere el sistema. El porcentaje lo definimos juntos. Si a ti te va bien, a nosotros también.') },
      { tag: t('4 · Offices for your salespeople', '4 · Oficinas para tus vendedores'), v: '$79+', unit: t('/ salesperson', '/ vendedor'),
        note: t('Every salesperson or dealer you bring gets an office: 2 agents for $79, 4 for $199 or 6 for $399 a month. Fast Sales earns a share of each one.', 'Cada vendedor o dealer que traigas recibe su oficina: 2 agentes por $79, 4 por $199 o 6 por $399 al mes. Fast Sales recibe una parte de cada una.') },
    ],
    fine: t(
      'Base price to get started. It does not include ad spend (paid directly to Meta or Google) or GHL call minutes and SMS, which are billed by usage. The commission and the salesperson office split are put in writing before we start.',
      'Precio base para iniciar. No incluye presupuesto de anuncios (lo pagas directo a Meta o Google) ni minutos de llamadas y SMS de tu GHL, que se cobran según uso. La comisión y el reparto de las oficinas de vendedores quedan por escrito antes de empezar.',
    ),
  },

  complex: {
    eyebrow: t('Partnership · the Fast Sales complex', 'Sociedad · el complejo de Fast Sales'),
    title: [t('Every salesperson', 'Cada vendedor,'), t('gets an office.', 'su propia oficina.')],
    lead: t(
      'You have the dealer connections. We bring the technology. Together we fill Sales City: your office on top and an office for every salesperson and dealer team who comes to work with you. You see every building; each salesperson sees only theirs.',
      'Tú tienes las conexiones con los dealers. Nosotros ponemos la tecnología. Juntos llenamos Sales City: tu oficina arriba y una oficina por cada vendedor y equipo de dealer que entre a trabajar contigo. Tú ves todos los edificios; cada vendedor solo ve la suya.',
    ),
    rows: [
      { l: 'L7', n: t('Dealer team · 6 agents', 'Equipo de un dealer · 6 agentes'), p: t('$399/mo', '$399/mes') },
      { l: 'L6', n: t('Salesperson · 4 agents', 'Vendedor · 4 agentes'), p: t('$199/mo', '$199/mes') },
      { l: 'L5', n: t('Salesperson · 2 agents', 'Vendedor · 2 agentes'), p: t('$79/mo', '$79/mes') },
      { l: 'L4', n: t('Fast Sales Training Center · Elvis + Max + 6 agents', 'Fast Sales Training Center · Elvis + Max + 6 agentes'), p: t('Your office', 'Tu oficina'), you: true },
    ],
    rent: t('Rental tower floors are also open to any business: $199/mo per floor.', 'Los pisos de las torres de renta también están abiertos a cualquier negocio: $199/mes por piso.'),
  },

  plan: {
    eyebrow: t('How we start', 'Cómo arrancamos'),
    title: [t('From yes to the first lead', 'Del sí al primer lead'), t('answered by AI.', 'atendido por IA.')],
    steps: [
      { w: t('Week 1', 'Semana 1'), h: t('Setup', 'Setup'), p: t('We connect your GHL, renew the SSL and load your techniques and courses so the agents talk like you.', 'Conectamos tu GHL, renovamos el SSL, cargamos tus técnicas y cursos para que los agentes hablen como tú.') },
      { w: t('Week 2', 'Semana 2'), h: t('Team live', 'Equipo en vivo'), p: t('Vera, Nico and Iris handle real leads and students. Luna publishes the first week of content.', 'Vera, Nico e Iris atienden leads y alumnos reales. Luna publica la primera semana de contenido.') },
      { w: t('Weeks 3 and 4', 'Semanas 3 y 4'), h: t('Tune', 'Ajuste'), p: t('Teo launches ads to the free guide. Max measures what works and proposes changes every week.', 'Teo lanza anuncios a la guía gratuita. Max mide qué funciona y te propone cambios cada semana.') },
      { w: t('Month 2', 'Mes 2'), h: t('The city', 'La ciudad'), p: t('Dante opens the first dealer buildings and salesperson offices in Sales City. The partnership starts.', 'Dante abre los primeros edificios de dealers y oficinas de vendedores en Sales City. Arranca la sociedad.') },
    ],
  },

  close: {
    eyebrow: t('Next step', 'Siguiente paso'),
    title: [t('Walk into your office.', 'Entra a tu oficina.'), t('Then we talk.', 'Luego hablamos.')],
    lead: t('Watch your team work in the demo. If you like what you see, we set the commission, sign, and within a week your office is answering real leads.', 'Mira a tu equipo trabajar en la demo. Si te gusta lo que ves, definimos la comisión, firmamos y en una semana tu oficina está atendiendo leads reales.'),
    cta: t('Open my demo office →', 'Abrir mi oficina demo →'),
  },

  ui: {
    proposal: t('Proposal', 'Propuesta'),
    valid: t('valid {n} days', 'válida {n} días'),
  },
};
