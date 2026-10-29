import { ArtWorkspace } from '../editors/art/ArtWorkspace';

// Phase 1: the app is the Art workspace. Projects, the asset library and the other workspaces
// arrive in later tasks (docs/IMPLEMENTATION_PLAN.md).
export function App() {
  return <ArtWorkspace />;
}
