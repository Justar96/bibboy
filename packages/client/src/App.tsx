import { Suspense, lazy } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { MainLayout } from "./components/MainLayout"
import { HomePage } from "./pages/HomePage"

// Lazy load non-critical routes for code splitting
const PlaygroundPage = lazy(() => import("./pages/PlaygroundPage"))
const NotFound = lazy(() => import("./pages/NotFound"))

// Minimal loading indicator - content loads fast with prefetching
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="skeleton h-6 w-48 rounded-sm"></div>
  </div>
)

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path="playground" element={
            <Suspense fallback={<PageLoader />}>
              <PlaygroundPage />
            </Suspense>
          } />
          <Route path="*" element={
            <Suspense fallback={<PageLoader />}>
              <NotFound />
            </Suspense>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
