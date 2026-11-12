
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LiveProvider } from "./contexts/LiveContext";

import { StaffLayout, UserLayout } from "./components/Layout";
import AdminLayout from "./components/AdminLayout";
import { Spinner } from "./components/Status";

// Customer Pages
import OfficeParking from "./pages/OfficeParking";
import Bookings from "./pages/Bookings";

// Dedicated Admin Portal
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLocations from "./pages/AdminLocations";
import AdminSlots from "./pages/AdminSlots";
import AdminBookings from "./pages/AdminBookings";
import AdminTeam from "./pages/AdminTeam";
import Gate from "./pages/Gate";

// ========================================
// PROTECTED ROUTE
// ========================================

function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Spinner />;
  }

  if (!user) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// ========================================
// APPLICATION ROUTES
// ========================================

function AppRoutes() {
  return (
    <LiveProvider>
      <Routes>
        {/* CUSTOMER ROUTES */}
        <Route element={<UserLayout />}>
          <Route index element={<OfficeParking />} />
          <Route path="parkings" element={<Navigate to="/" replace />} />
          <Route path="parking/:id" element={<OfficeParking />} />
          <Route path="bookings" element={<Bookings />} />
        </Route>

        {/* DEDICATED SEPARATE ADMIN LOGIN */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/login" element={<Navigate to="/admin/login" replace />} />
        <Route path="/register" element={<Navigate to="/admin/login" replace />} />

        {/* DEDICATED SEPARATE ADMIN WORKSPACE */}
        <Route
          element={
            <Guard roles={["admin", "staff"]}>
              <AdminLayout />
            </Guard>
          }
        >
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />

          <Route path="/admin/slots" element={<AdminSlots />} />
          <Route path="/manage/slots" element={<Navigate to="/admin/slots" replace />} />

          <Route path="/admin/bookings" element={<AdminBookings />} />
          <Route path="/manage/bookings" element={<Navigate to="/admin/bookings" replace />} />

          <Route path="/admin/gate" element={<Gate />} />
          <Route path="/gate" element={<Navigate to="/admin/gate" replace />} />

          <Route path="/admin/settings" element={<AdminLocations />} />
          <Route path="/manage/locations" element={<Navigate to="/admin/settings" replace />} />

          <Route path="/admin/team" element={<AdminTeam />} />
          <Route path="/manage/team" element={<Navigate to="/admin/team" replace />} />
        </Route>

        {/* FALLBACK ROUTE */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </LiveProvider>
  );
}

// ========================================
// MAIN APP COMPONENT
// ========================================

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
