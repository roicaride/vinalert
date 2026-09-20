/**
 * Los textos de la portada, en castellano, galego e ingles.
 *
 * Solo la portada es trilingue: es lo que ve alguien que todavia no es
 * usuario. La aplicacion sigue en castellano.
 *
 * Todo lo que se afirma aqui sobre el producto sale del README y del firmware
 * (LoRa a 868 MHz, nodos solares, bufer en flash, intervalo de 5 min a 24 h,
 * tres niveles de permiso). Si cambia el producto, cambia aqui.
 */

// ---------------------------------------------------------------------------
// RELLENAR ANTES DE PUBLICAR
//
// El correo de contacto y las personas del equipo no salen del codigo: son
// huecos a proposito, para que en la web publica no aparezca nadie inventado.
// `example.com` es un dominio reservado que no pertenece a nadie.
// ---------------------------------------------------------------------------
export const CORREO_CONTACTO = 'contacto@example.com';

/** Una entrada por persona. `tinta` es el color de su cuadrado de marca. */
export const EQUIPO = [
  { tinta: 'bg-vina', nombre: null, cargo: null, linea: null },
  { tinta: 'bg-oso', nombre: null, cargo: null, linea: null },
  { tinta: 'bg-brote', nombre: null, cargo: null, linea: null },
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
      crear: 'Crear cuenta',
      idioma: 'Idioma',
      principal: 'Secciones de la página',
    },
    portada: {
      rotulo: 'Viticultura de precisión',
      titulo: 'Deja que la viña hable.',
      texto:
        'Sondas en el suelo, una red LoRa en la parcela y una plataforma que convierte cada lectura en decisiones de riego, tratamientos documentados y análisis agronómico.',
      demo: 'Solicitar una demostración',
      ejemplo: 'Vista de ejemplo',
      online: 'Online',
      inactivo: 'Inactivo',
      pasarela: 'Pasarela',
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
        { titulo: 'Clima y balance hídrico', texto: 'Condiciones horarias y diarias de Open-Meteo, y la ET₀ frente a la lluvia para saber cuándo regar.' },
        { titulo: 'Cuaderno de tratamientos', texto: 'Cada aplicación queda registrada con el tiempo que hacía al hacerla.' },
        { titulo: 'Mediciones foliares', texto: 'Sube el Excel del Dualex: clorofila, flavonoles y balance de nitrógeno.' },
        { titulo: 'Análisis', texto: 'Series temporales que cruzan suelo, clima, hoja y tratamientos en el mismo eje.' },
        { titulo: 'Equipos y permisos', texto: 'Varias parcelas y varias personas, con permisos para cada parcela.' },
        { titulo: 'Exportación', texto: 'Libros Excel con toda la telemetría y el clima de cada lectura.' },
        { titulo: 'Dispositivos', texto: 'Alta y baja de nodos desde la web, y cambio del intervalo de medida sin reprogramar.' },
      ],
    },
    ficha: {
      rotulo: 'Ficha técnica',
      titulo: 'Lo que hay dentro.',
      filas: [
        ['Radio', 'LoRa · 868 MHz'],
        ['Sondas', 'RS-485 · Modbus'],
        ['Alimentación', 'Solar'],
        ['Intervalo de medida', 'De 5 min a 24 h'],
        ['Datos climáticos', 'Open-Meteo'],
        ['Permisos', '3 niveles por parcela'],
        ['Exportación', 'Excel · CSV'],
      ],
    },
    equipo: {
      rotulo: 'Quiénes somos',
      titulo: 'Gente de viña y gente de taller.',
      texto:
        'Viñalert nace de juntar dos oficios: el de quien cuida la viña y el de quien construye aparatos que miden. Diseñamos el hardware, escribimos el software y lo probamos en el campo.',
      nombre: '[Nombre y apellidos]',
      cargo: '[Cargo]',
      linea: '[Una línea sobre su papel]',
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
      crear: 'Crear conta',
      idioma: 'Idioma',
      principal: 'Seccións da páxina',
    },
    portada: {
      rotulo: 'Viticultura de precisión',
      titulo: 'Deixa que a viña fale.',
      texto:
        'Sondas no chan, unha rede LoRa na parcela e unha plataforma que converte cada lectura en decisións de rega, tratamentos documentados e análise agronómica.',
      demo: 'Solicitar unha demostración',
      ejemplo: 'Vista de exemplo',
      online: 'Online',
      inactivo: 'Inactivo',
      pasarela: 'Pasarela',
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
        { titulo: 'Clima e balance hídrico', texto: 'Condicións horarias e diarias de Open-Meteo, e a ET₀ fronte á choiva para saber cando regar.' },
        { titulo: 'Caderno de tratamentos', texto: 'Cada aplicación queda rexistrada co tempo que facía ao facela.' },
        { titulo: 'Medicións foliares', texto: 'Sobe o Excel do Dualex: clorofila, flavonoles e balance de nitróxeno.' },
        { titulo: 'Análise', texto: 'Series temporais que cruzan chan, clima, folla e tratamentos no mesmo eixe.' },
        { titulo: 'Equipos e permisos', texto: 'Varias parcelas e varias persoas, con permisos para cada parcela.' },
        { titulo: 'Exportación', texto: 'Libros Excel con toda a telemetría e o clima de cada lectura.' },
        { titulo: 'Dispositivos', texto: 'Alta e baixa de nodos desde a web, e cambio do intervalo de medida sen reprogramar.' },
      ],
    },
    ficha: {
      rotulo: 'Ficha técnica',
      titulo: 'O que hai dentro.',
      filas: [
        ['Radio', 'LoRa · 868 MHz'],
        ['Sondas', 'RS-485 · Modbus'],
        ['Alimentación', 'Solar'],
        ['Intervalo de medida', 'De 5 min a 24 h'],
        ['Datos climáticos', 'Open-Meteo'],
        ['Permisos', '3 niveis por parcela'],
        ['Exportación', 'Excel · CSV'],
      ],
    },
    equipo: {
      rotulo: 'Quen somos',
      titulo: 'Xente de viña e xente de taller.',
      texto:
        'Viñalert nace de xuntar dous oficios: o de quen coida a viña e o de quen constrúe aparellos que miden. Deseñamos o hardware, escribimos o software e probámolo no campo.',
      nombre: '[Nome e apelidos]',
      cargo: '[Cargo]',
      linea: '[Unha liña sobre o seu papel]',
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
      crear: 'Create account',
      idioma: 'Language',
      principal: 'Page sections',
    },
    portada: {
      rotulo: 'Precision viticulture',
      titulo: 'Let the vineyard speak.',
      texto:
        'Probes in the soil, a LoRa network across the plot and a platform that turns every reading into irrigation decisions, documented treatments and agronomic analysis.',
      demo: 'Request a demo',
      ejemplo: 'Sample view',
      online: 'Online',
      inactivo: 'Inactive',
      pasarela: 'Gateway',
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
        { titulo: 'Weather and water balance', texto: 'Hourly and daily conditions from Open-Meteo, and ET₀ against rainfall to know when to irrigate.' },
        { titulo: 'Treatment log', texto: 'Every application is recorded with the weather at the time it was made.' },
        { titulo: 'Foliar measurements', texto: 'Upload the Dualex spreadsheet: chlorophyll, flavonols and nitrogen balance.' },
        { titulo: 'Analysis', texto: 'Time series that overlay soil, weather, leaf and treatments on the same axis.' },
        { titulo: 'Teams and permissions', texto: 'Several plots and several people, with permissions set for each plot.' },
        { titulo: 'Export', texto: 'Excel workbooks with all the telemetry and the weather for every reading.' },
        { titulo: 'Devices', texto: 'Add and remove nodes from the web, and change the sampling interval without reflashing.' },
      ],
    },
    ficha: {
      rotulo: 'Technical sheet',
      titulo: 'What’s inside.',
      filas: [
        ['Radio', 'LoRa · 868 MHz'],
        ['Probes', 'RS-485 · Modbus'],
        ['Power', 'Solar'],
        ['Sampling interval', '5 min to 24 h'],
        ['Weather data', 'Open-Meteo'],
        ['Permissions', '3 levels per plot'],
        ['Export', 'Excel · CSV'],
      ],
    },
    equipo: {
      rotulo: 'Who we are',
      titulo: 'Vineyard people and workshop people.',
      texto:
        'Viñalert brings together two trades: looking after the vines and building instruments that measure. We design the hardware, write the software and test it in the field.',
      nombre: '[Full name]',
      cargo: '[Role]',
      linea: '[One line about their part]',
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
