import { render, screen } from '@testing-library/react';

function Saludo() {
  return <p>el entorno de tests funciona</p>;
}

test('renderiza un componente y encuentra su texto', () => {
  render(<Saludo />);
  expect(screen.getByText('el entorno de tests funciona')).toBeInTheDocument();
});
