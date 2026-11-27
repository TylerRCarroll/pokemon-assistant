import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CalcPage } from './features/calc/CalcPage';
import { AbilityDetail } from './features/dex/AbilityDetail';
import { DexPage } from './features/dex/DexPage';
import { MoveDetail } from './features/dex/MoveDetail';
import { PokemonDetail } from './features/dex/PokemonDetail';
import { PlannerPage } from './features/planner/PlannerPage';
import { TeamPage } from './features/team/TeamPage';
import { PcPage } from './features/pc/PcPage';
import { BackupPage } from './features/backup/BackupPage';
import { TrainerPage } from './features/trainer/TrainerPage';
import { TypesPage } from './features/types/TypesPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/types" replace /> },
      { path: 'types', element: <TypesPage /> },
      { path: 'dex', element: <DexPage /> },
      { path: 'dex/pokemon/:id', element: <PokemonDetail /> },
      { path: 'dex/moves/:id', element: <MoveDetail /> },
      { path: 'dex/abilities/:id', element: <AbilityDetail /> },
      { path: 'team', element: <TeamPage /> },
      { path: 'pc', element: <PcPage /> },
      { path: 'planner/:mon?', element: <PlannerPage /> },
      { path: 'calc', element: <CalcPage /> },
      // the battle engine is big: it loads with this page, not the app
      { path: 'battle', lazy: () => import('./features/battle/BattlePage').then((m) => ({ Component: m.BattlePage })) },
      { path: 'trainer', element: <TrainerPage /> },
      { path: 'backup', element: <BackupPage /> },
    ],
  },
  // match Vite's base so routes work under /pokemon-assistant/ on GitHub Pages
], { basename: import.meta.env.BASE_URL });

export default function App() {
  return <RouterProvider router={router} />;
}
