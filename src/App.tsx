import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CalcPage } from './features/calc/CalcPage';
import { AbilityDetail } from './features/dex/AbilityDetail';
import { DexPage } from './features/dex/DexPage';
import { MoveDetail } from './features/dex/MoveDetail';
import { PokemonDetail } from './features/dex/PokemonDetail';
import { PlannerPage } from './features/planner/PlannerPage';
import { TeamPage } from './features/team/TeamPage';
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
      { path: 'planner/:mon?', element: <PlannerPage /> },
      { path: 'calc', element: <CalcPage /> },
      { path: 'trainer', element: <TrainerPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
