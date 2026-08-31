import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import NewReportWizard from './pages/invigilator/NewReportWizard';
import MySubmissions from './pages/invigilator/MySubmissions';
import StageQueue from './pages/officer/StageQueue';
import PassedCases from './pages/officer/PassedCases';
import SenateMembers from './pages/senate/SenateMembers';
import MyCase from './pages/student/MyCase';
import AdminPanel from './pages/admin/AdminPanel';
import AuditLog from './pages/admin/AuditLog';
import AllReports from './pages/admin/AllReports';
import CaseDetail from './pages/CaseDetail';

const HOME_BY_ROLE = {
  invigilator: '/reports/mine',
  exam_officer: '/queue',
  college_officer: '/queue',
  registry_officer: '/queue',
  senate_board: '/queue',
  senate_president: '/queue',
  super_admin: '/admin',
  student: '/my-case',
};

function Home() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={HOME_BY_ROLE[user.role] || '/login'} replace />;
}

function Shell({ children }) {
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Home />} />

          <Route
            path="/reports/new"
            element={<ProtectedRoute roles={['invigilator']}><Shell><NewReportWizard /></Shell></ProtectedRoute>}
          />
          <Route
            path="/reports/mine"
            element={<ProtectedRoute roles={['invigilator']}><Shell><MySubmissions /></Shell></ProtectedRoute>}
          />
          <Route
            path="/queue"
            element={<ProtectedRoute roles={['exam_officer', 'college_officer', 'registry_officer', 'senate_board', 'senate_president']}><Shell><StageQueue /></Shell></ProtectedRoute>}
          />
          <Route
            path="/queue/passed"
            element={<ProtectedRoute roles={['exam_officer', 'college_officer', 'registry_officer', 'senate_board', 'senate_president']}><Shell><PassedCases /></Shell></ProtectedRoute>}
          />
          <Route
            path="/senate/members"
            element={<ProtectedRoute roles={['senate_president']}><Shell><SenateMembers /></Shell></ProtectedRoute>}
          />
          <Route
            path="/my-case"
            element={<ProtectedRoute roles={['student']}><Shell><MyCase /></Shell></ProtectedRoute>}
          />
          <Route
            path="/admin"
            element={<ProtectedRoute roles={['super_admin']}><Shell><AdminPanel /></Shell></ProtectedRoute>}
          />
          <Route
            path="/admin/audit"
            element={<ProtectedRoute roles={['super_admin']}><Shell><AuditLog /></Shell></ProtectedRoute>}
          />
          <Route
            path="/reports/all"
            element={<ProtectedRoute roles={['super_admin']}><Shell><AllReports /></Shell></ProtectedRoute>}
          />
          <Route
            path="/reports/:reportId"
            element={<ProtectedRoute><Shell><CaseDetail /></Shell></ProtectedRoute>}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
