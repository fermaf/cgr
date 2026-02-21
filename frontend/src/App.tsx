import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Home } from "./pages/Home";
import { DictamenDetail } from "./pages/DictamenDetail";
import { SearchResults } from "./pages/SearchResults";
import { Stats } from "./pages/Stats";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="dictamenes" element={<Home />} />
        <Route path="buscar" element={<SearchResults />} />
        <Route path="stats" element={<Stats />} />
        <Route path="dictamen/:id" element={<DictamenDetail />} />
        <Route path="*" element={<div className="p-8">Página no encontrada</div>} />
      </Route>
    </Routes>
  );
}

export default App;
