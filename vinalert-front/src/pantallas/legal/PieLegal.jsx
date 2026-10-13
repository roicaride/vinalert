import { Link } from 'react-router-dom';

const ENLACES = [
  { to: '/aviso-legal', nombre: 'Aviso legal' },
  { to: '/privacidad', nombre: 'Privacidad' },
  { to: '/cookies', nombre: 'Cookies' },
  { to: '/condiciones', nombre: 'Condiciones de uso' },
];

/** Los enlaces a las paginas legales: la LSSI exige que esten accesibles desde cualquier pagina publica. */
export default function PieLegal({ className = '' }) {
  return (
    <nav aria-label="Información legal" className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${className}`}>
      {ENLACES.map((e) => (
        <Link key={e.to} to={e.to} className="rotulo text-oso-3 hover:text-brote">
          {e.nombre}
        </Link>
      ))}
    </nav>
  );
}
