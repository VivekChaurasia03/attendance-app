import AttendanceForm from "./components/AttendanceForm";
import Dashboard from "./components/Dashboard";
import "./App.css";

function App() {
  const path = window.location.pathname;

  if (path === "/dashboard") {
    return <Dashboard />;
  }

  return <AttendanceForm />;
}

export default App;
