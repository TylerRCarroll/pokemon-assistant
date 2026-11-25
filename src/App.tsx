import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout';
import { TypesPage } from './features/types/TypesPage';
import { useRuleset } from './state/ruleset';

function ComingSoon({ title, phase, blurb }: { title: string; phase: number; blurb: string }) {
  const rs = useRuleset();
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-slate-500">{blurb}</p>
      <p className="mt-4 text-xs uppercase tracking-wide text-slate-400">
        Phase {phase} · will use {rs.name} · {rs.species().length} species loaded
      </p>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/types" replace /> },
      { path: 'types', element: <TypesPage /> },
      { path: 'dex', element: <ComingSoon title="Dex" phase={2} blurb="Pokémon, moves, abilities, items, and learnsets." /> },
      { path: 'team', element: <ComingSoon title="Team Builder" phase={3} blurb="Six slots, legal sets, coverage warnings, Showdown import/export." /> },
      { path: 'planner/:mon?', element: <ComingSoon title="Move Planner" phase={4} blurb="Popular sets, items, abilities, teammates, and sample teams." /> },
      { path: 'calc', element: <ComingSoon title="Damage Calc" phase={5} blurb="Smogon calc plus meta threat checks against your team." /> },
      { path: 'trainer', element: <ComingSoon title="Matchup Trainer" phase={6} blurb="Spaced-repetition quizzes on types, abilities, and counters." /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
