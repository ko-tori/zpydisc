import * as React from 'react';
import { AuthenticatedContextProvider } from './hooks/useAuthenticatedContext';

import { Game } from './components/Game';
export default function App() {
  return (
    <AuthenticatedContextProvider>
      <Game />
    </AuthenticatedContextProvider>
  );
}
