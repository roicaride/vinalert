/**
 * Los textos de la portada, en castellano, galego e ingles.
 *
 * Solo la portada es trilingue: es lo que ve alguien que todavia no es
 * usuario. La aplicacion sigue en castellano.
 *
 * Todo lo que se afirma aqui sobre el producto tiene que ser cierto hoy: sale
 * del README y del firmware (LoRa a 868 MHz, nodos solares, bufer en flash,
 * intervalo de 5 min a 24 h, permisos de gestion y lectura por parcela, alta
 * por invitacion). La logica de riego se retiro en septiembre de 2026: no se
 * promete. No se nombran proveedores de datos (clima, mapas): se cuenta lo que
 * gana quien lo usa; las atribuciones que exigen sus licencias van en el aviso
 * legal y junto a los propios datos. Si cambia el producto, cambia aqui (lo vigila
 * portada/landing.test.jsx).
 */

// El correo de contacto de Viñalert (demostraciones). Si en Administracion >
// Configuracion se rellena el email del titular, la portada usa ese.
export const CORREO_CONTACTO = 'hortalert@gmail.com';

/**
 * Los tres cofundadores. Cargo y linea van traducidos en TEXTOS[idioma].equipo.
 * `tinta` es el color de su cuadrado de marca. Sin fotos, a proposito.
 */
export const EQUIPO = [
  {
    id: 'roi',
    nombre: 'Roi Caride',
    iniciales: 'RC',
    tinta: 'bg-vina text-oso',
    linkedin: 'https://www.linkedin.com/in/roi-caride-borrajo/',
  },
  {
    id: 'levi',
    nombre: 'Levi García',
    iniciales: 'LG',
    tinta: 'bg-oso text-lousa',
    linkedin: 'https://www.linkedin.com/in/levi--garcia/',
  },
  {
    id: 'angel',
    nombre: 'Ángel de la Peña',
    iniciales: 'ÁP',
    tinta: 'bg-brote text-lousa',
    linkedin: 'https://www.linkedin.com/in/%C3%A1ngel-de-la-pe%C3%B1a-freire-319520247/',
  },
];

export const IDIOMAS = [
  { codigo: 'es', corto: 'ES', nombre: 'Castellano' },
  { codigo: 'gl', corto: 'GL', nombre: 'Galego' },
  { codigo: 'en', corto: 'EN', nombre: 'English' },
];

export const TEXTOS = {
  es: {
    nav: {
      como: 'Cómo funciona',
      ofrecemos: 'Qué ofrecemos',
      equipo: 'Equipo',
      contacto: 'Contacto',
      entrar: 'Iniciar sesión',
      idioma: 'Idioma',
      principal: 'Secciones de la página',
    },
    portada: {
      rotulo: 'Viticultura de precisión',
      titulo: 'Deja que la viña hable.',
      texto:
        'Sondas en el suelo, una red LoRa en la parcela y una plataforma que convierte cada lectura en balance hídrico, tratamientos documentados y análisis agronómico.',
      demo: 'Solicitar una demostración',
      verEjemplo: 'Ver una parcela de ejemplo',
      ejemplo: 'Vista de ejemplo',
    },
    corte: {
      descripcion:
        'Corte del suelo de una parcela de ejemplo: una cepa, sus raíces y tres sondas a 20, 40 y 60 cm que miden la humedad, y el nodo que envía las lecturas por LoRa.',
      humedad: 'Humedad',
      nodo: 'Nodo N-01',
      envio: 'Envía por LoRa · 868 MHz',
    },
    trayectoria: {
      rotulo: 'Trayectoria',
      items: [
        { titulo: 'Ya en uso', texto: 'Primera instalación en el centro de investigación de una universidad pública.', detalle: '7 nodos · 18 sensores' },
        { titulo: 'Semente Ribeira Sacra', texto: 'Ganadores del premio, tras ser finalistas dos veces.', detalle: '5.000 €' },
        { titulo: 'Incuba Emprende', texto: 'Nos acompaña con su programa de mentoring para proyectos emprendedores.' },
      ],
    },
    como: {
      rotulo: 'Cómo funciona',
      titulo: 'Del suelo a la pantalla, en cuatro pasos.',
      texto: 'Hardware propio en el campo y software propio en la nube, pensados para funcionar juntos.',
      pasos: [
        {
          titulo: 'Sonda',
          texto: 'Sondas RS-485 enterradas a la profundidad de las raíces miden la humedad y la temperatura del suelo.',
        },
        {
          titulo: 'Nodo',
          texto: 'Un ESP32 con placa solar lee las sondas y transmite por LoRa, con largo alcance y sin depender de la cobertura móvil.',
        },
        {
          titulo: 'Maestro',
          texto: 'Recoge los nodos y sube las lecturas por wifi. Si se cae la red, las guarda y las envía después.',
        },
        {
          titulo: 'Plataforma',
          texto: 'Cada lectura llega con su hora y con el tiempo que hacía en ese instante, y se consolida en datos diarios.',
        },
      ],
    },
    ofrecemos: {
      rotulo: 'Qué ofrecemos',
      titulo: 'Todo lo que pasa en la parcela, en un solo sitio.',
      items: [
        { titulo: 'Telemetría del suelo', texto: 'Humedad y temperatura por sensor, lectura a lectura, con la hora exacta de cada una.' },
        { titulo: 'Clima y balance hídrico', texto: 'Condiciones horarias y diarias, y la ET₀ frente a la lluvia para seguir el agua que gana o pierde la parcela.' },
        { titulo: 'Cuaderno de tratamientos', texto: 'Cada aplicación queda registrada con el tiempo que hacía al hacerla.' },
        { titulo: 'Mediciones foliares', texto: 'Sube el Excel del Dualex: clorofila, flavonoles y balance de nitrógeno.' },
        { titulo: 'Análisis', texto: 'Series temporales que cruzan suelo, clima, hoja y tratamientos en el mismo eje.' },
        { titulo: 'Acceso por invitación', texto: 'Cada persona entra invitada por quien gestiona la parcela, con permiso de gestión o de lectura.' },
        { titulo: 'Mapa de la parcela', texto: 'Cada nodo sobre la foto aérea de la parcela, con su estado y su última lectura.' },
        { titulo: 'Dispositivos', texto: 'Alta de nodos y cambio del intervalo de medida desde la web, y aviso cuando un nodo deja de enviar.' },
      ],
    },
    ficha: {
      rotulo: 'Ficha técnica',
      titulo: 'Lo que hay dentro.',
      filas: [
        ['Radio', 'LoRa 868 MHz, sin cobertura móvil'],
        ['Sondas', 'RS-485 · Modbus'],
        ['Alimentación', 'Solar, sin cables'],
        ['Sin conexión', 'Guarda las lecturas y las envía después'],
        ['Intervalo de medida', 'De 5 min a 24 h, desde la web'],
        ['Acceso', 'Por invitación, con permisos por parcela'],
        ['Exportación', 'Excel · CSV'],
      ],
    },
    equipo: {
      rotulo: 'Quiénes somos',
      titulo: 'Tres cofundadores, tres oficios.',
      texto:
        'Uno construye el software, otro la electrónica que pasa el invierno en el campo y otro hace que el proyecto se sostenga. Lo diseñamos, lo programamos y lo instalamos nosotros.',
      linkedin: 'LinkedIn',
      linkedinDe: 'LinkedIn de',
      personas: {
        roi: { cargo: 'Cofundador · Software e IA', linea: 'La plataforma: la API, la web y el tratamiento de los datos.' },
        levi: { cargo: 'Cofundador · Negocio y comunicación', linea: 'Estrategia comercial, presupuestos y la identidad de la marca.' },
        angel: { cargo: 'Cofundador · Electrónica y firmware', linea: 'Los nodos, las sondas y la red LoRa que trabajan en el campo.' },
      },
    },
    contacto: {
      rotulo: 'Contacto',
      titulo: '¿Hablamos de tu parcela?',
      texto: 'Cuéntanos qué cultivas y cuántas hectáreas tienes, y te preparamos una demostración.',
      asunto: 'Demostración de Viñalert',
    },
    pie: {
      derechos: 'Todos los derechos reservados.',
    },
  },

  gl: {
    nav: {
      como: 'Como funciona',
      ofrecemos: 'Que ofrecemos',
      equipo: 'Equipo',
      contacto: 'Contacto',
      entrar: 'Iniciar sesión',
      idioma: 'Idioma',
      principal: 'Seccións da páxina',
    },
    portada: {
      rotulo: 'Viticultura de precisión',
      titulo: 'Deixa que a viña fale.',
      texto:
        'Sondas no chan, unha rede LoRa na parcela e unha plataforma que converte cada lectura en balance hídrico, tratamentos documentados e análise agronómica.',
      demo: 'Solicitar unha demostración',
      verEjemplo: 'Ver unha parcela de exemplo',
      ejemplo: 'Vista de exemplo',
    },
    corte: {
      descripcion:
        'Corte do chan dunha parcela de exemplo: unha cepa, as súas raíces e tres sondas a 20, 40 e 60 cm que miden a humidade, e o nodo que envía as lecturas por LoRa.',
      humedad: 'Humidade',
      nodo: 'Nodo N-01',
      envio: 'Envía por LoRa · 868 MHz',
    },
    trayectoria: {
      rotulo: 'Traxectoria',
      items: [
        { titulo: 'Xa en uso', texto: 'Primeira instalación no centro de investigación dunha universidade pública.', detalle: '7 nodos · 18 sensores' },
        { titulo: 'Semente Ribeira Sacra', texto: 'Gañadores do premio, despois de ser finalistas dúas veces.', detalle: '5.000 €' },
        { titulo: 'Incuba Emprende', texto: 'Acompáñanos co seu programa de mentoring para proxectos emprendedores.' },
      ],
    },
    como: {
      rotulo: 'Como funciona',
      titulo: 'Do chan á pantalla, en catro pasos.',
      texto: 'Hardware propio no campo e software propio na nube, pensados para funcionar xuntos.',
      pasos: [
        {
          titulo: 'Sonda',
          texto: 'Sondas RS-485 enterradas á profundidade das raíces miden a humidade e a temperatura do chan.',
        },
        {
          titulo: 'Nodo',
          texto: 'Un ESP32 con placa solar le as sondas e transmite por LoRa, con longo alcance e sen depender da cobertura móbil.',
        },
        {
          titulo: 'Mestre',
          texto: 'Recolle os nodos e sobe as lecturas por wifi. Se cae a rede, gárdaas e envíaas despois.',
        },
        {
          titulo: 'Plataforma',
          texto: 'Cada lectura chega coa súa hora e co tempo que facía nese instante, e consolídase en datos diarios.',
        },
      ],
    },
    ofrecemos: {
      rotulo: 'Que ofrecemos',
      titulo: 'Todo o que pasa na parcela, nun só sitio.',
      items: [
        { titulo: 'Telemetría do chan', texto: 'Humidade e temperatura por sensor, lectura a lectura, coa hora exacta de cada unha.' },
        { titulo: 'Clima e balance hídrico', texto: 'Condicións horarias e diarias, e a ET₀ fronte á choiva para seguir a auga que gaña ou perde a parcela.' },
        { titulo: 'Caderno de tratamentos', texto: 'Cada aplicación queda rexistrada co tempo que facía ao facela.' },
        { titulo: 'Medicións foliares', texto: 'Sobe o Excel do Dualex: clorofila, flavonoles e balance de nitróxeno.' },
        { titulo: 'Análise', texto: 'Series temporais que cruzan chan, clima, folla e tratamentos no mesmo eixe.' },
        { titulo: 'Acceso por invitación', texto: 'Cada persoa entra invitada por quen xestiona a parcela, con permiso de xestión ou de lectura.' },
        { titulo: 'Mapa da parcela', texto: 'Cada nodo sobre a foto aérea da parcela, co seu estado e a súa última lectura.' },
        { titulo: 'Dispositivos', texto: 'Alta de nodos e cambio do intervalo de medida desde a web, e aviso cando un nodo deixa de enviar.' },
      ],
    },
    ficha: {
      rotulo: 'Ficha técnica',
      titulo: 'O que hai dentro.',
      filas: [
        ['Radio', 'LoRa 868 MHz, sen cobertura móbil'],
        ['Sondas', 'RS-485 · Modbus'],
        ['Alimentación', 'Solar, sen cables'],
        ['Sen conexión', 'Garda as lecturas e envíaas despois'],
        ['Intervalo de medida', 'De 5 min a 24 h, desde a web'],
        ['Acceso', 'Por invitación, con permisos por parcela'],
        ['Exportación', 'Excel · CSV'],
      ],
    },
    equipo: {
      rotulo: 'Quen somos',
      titulo: 'Tres cofundadores, tres oficios.',
      texto:
        'Un constrúe o software, outro a electrónica que pasa o inverno no campo e outro fai que o proxecto se sosteña. Deseñámolo, programámolo e instalámolo nós.',
      linkedin: 'LinkedIn',
      linkedinDe: 'LinkedIn de',
      personas: {
        roi: { cargo: 'Cofundador · Software e IA', linea: 'A plataforma: a API, a web e o tratamento dos datos.' },
        levi: { cargo: 'Cofundador · Negocio e comunicación', linea: 'Estratexia comercial, orzamentos e a identidade da marca.' },
        angel: { cargo: 'Cofundador · Electrónica e firmware', linea: 'Os nodos, as sondas e a rede LoRa que traballan no campo.' },
      },
    },
    contacto: {
      rotulo: 'Contacto',
      titulo: 'Falamos da túa parcela?',
      texto: 'Cóntanos que cultivas e cantas hectáreas tes, e preparámosche unha demostración.',
      asunto: 'Demostración de Viñalert',
    },
    pie: {
      derechos: 'Todos os dereitos reservados.',
    },
  },

  en: {
    nav: {
      como: 'How it works',
      ofrecemos: 'What we offer',
      equipo: 'Team',
      contacto: 'Contact',
      entrar: 'Sign in',
      idioma: 'Language',
      principal: 'Page sections',
    },
    portada: {
      rotulo: 'Precision viticulture',
      titulo: 'Let the vineyard speak.',
      texto:
        'Probes in the soil, a LoRa network across the plot and a platform that turns every reading into a water balance, documented treatments and agronomic analysis.',
      demo: 'Request a demo',
      verEjemplo: 'See a sample plot',
      ejemplo: 'Sample view',
    },
    corte: {
      descripcion:
        'Soil cross-section of a sample plot: a vine, its roots and three probes at 20, 40 and 60 cm measuring moisture, and the node that sends the readings over LoRa.',
      humedad: 'Moisture',
      nodo: 'Node N-01',
      envio: 'Sends over LoRa · 868 MHz',
    },
    trayectoria: {
      rotulo: 'Track record',
      items: [
        { titulo: 'Already in use', texto: 'First installation at a public university research centre.', detalle: '7 nodes · 18 sensors' },
        { titulo: 'Semente Ribeira Sacra', texto: 'Winners of the award, after being finalists twice.', detalle: '€5,000' },
        { titulo: 'Incuba Emprende', texto: 'Supports us through its mentoring programme for new ventures.' },
      ],
    },
    como: {
      rotulo: 'How it works',
      titulo: 'From soil to screen, in four steps.',
      texto: 'Our own hardware in the field and our own software in the cloud, built to work together.',
      pasos: [
        {
          titulo: 'Probe',
          texto: 'RS-485 probes buried at root depth measure soil moisture and temperature.',
        },
        {
          titulo: 'Node',
          texto: 'A solar-powered ESP32 reads the probes and transmits over LoRa, with long range and no need for mobile coverage.',
        },
        {
          titulo: 'Gateway',
          texto: 'Collects the nodes and uploads the readings over WiFi. If the network drops, it stores them and sends them later.',
        },
        {
          titulo: 'Platform',
          texto: 'Every reading arrives with its timestamp and the weather at that exact moment, and is rolled up into daily data.',
        },
      ],
    },
    ofrecemos: {
      rotulo: 'What we offer',
      titulo: 'Everything happening on the plot, in one place.',
      items: [
        { titulo: 'Soil telemetry', texto: 'Moisture and temperature per sensor, reading by reading, each with its exact time.' },
        { titulo: 'Weather and water balance', texto: 'Hourly and daily conditions, and ET₀ against rainfall to follow the water the plot gains or loses.' },
        { titulo: 'Treatment log', texto: 'Every application is recorded with the weather at the time it was made.' },
        { titulo: 'Foliar measurements', texto: 'Upload the Dualex spreadsheet: chlorophyll, flavonols and nitrogen balance.' },
        { titulo: 'Analysis', texto: 'Time series that overlay soil, weather, leaf and treatments on the same axis.' },
        { titulo: 'Invitation-only access', texto: 'Each person joins by invitation from whoever manages the plot, with manage or read-only permission.' },
        { titulo: 'Plot map', texto: 'Every node on an aerial photo of the plot, with its status and its latest reading.' },
        { titulo: 'Devices', texto: 'Add nodes and change the sampling interval from the web, and get warned when a node stops reporting.' },
      ],
    },
    ficha: {
      rotulo: 'Technical sheet',
      titulo: 'What’s inside.',
      filas: [
        ['Radio', 'LoRa 868 MHz, no mobile coverage needed'],
        ['Probes', 'RS-485 · Modbus'],
        ['Power', 'Solar, no cables'],
        ['Offline', 'Stores readings and sends them later'],
        ['Sampling interval', '5 min to 24 h, set from the web'],
        ['Access', 'By invitation, with per-plot permissions'],
        ['Export', 'Excel · CSV'],
      ],
    },
    equipo: {
      rotulo: 'Who we are',
      titulo: 'Three co-founders, three trades.',
      texto:
        'One builds the software, one the electronics that spend the winter in the field, and one keeps the project on its feet. We design it, program it and install it ourselves.',
      linkedin: 'LinkedIn',
      linkedinDe: 'LinkedIn of',
      personas: {
        roi: { cargo: 'Co-founder · Software and AI', linea: 'The platform: the API, the web app and the data processing.' },
        levi: { cargo: 'Co-founder · Business and communication', linea: 'Sales strategy, budgets and the brand identity.' },
        angel: { cargo: 'Co-founder · Electronics and firmware', linea: 'The nodes, the probes and the LoRa network working in the field.' },
      },
    },
    contacto: {
      rotulo: 'Contact',
      titulo: 'Shall we talk about your plot?',
      texto: 'Tell us what you grow and how many hectares you have, and we’ll set up a demo for you.',
      asunto: 'Viñalert demo',
    },
    pie: {
      derechos: 'All rights reserved.',
    },
  },
};
