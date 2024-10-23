import * as React from 'react';
import { Player } from './Player';
import { useAuthenticatedContext } from '../hooks/useAuthenticatedContext';

import './Game.css';

export function Game() {
  const authenticatedContext = useAuthenticatedContext();
  const containerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="game__root">

    </div>
  );
}
