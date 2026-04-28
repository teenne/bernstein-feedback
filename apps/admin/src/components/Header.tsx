import { NavLink } from "react-router-dom";
import { Notification } from "./Notification";

interface NavItem {
  to: string;
  label: string;
}

interface HeaderProps {
  navItems: NavItem[];
  projectIds: string[];
  activeProjectId: string;
  onProjectChange: (id: string) => void;
  showProjectDropdown: boolean;
  isAdmin: boolean;
  email: string | null;
  onSignOut: () => void;
}

export function Header({
  navItems,
  projectIds,
  activeProjectId,
  onProjectChange,
  showProjectDropdown,
  isAdmin,
  email,
  onSignOut,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand lockup — logo + wordmark sit together on the left */}
        <div className="flex items-center gap-2">
          <img
            src="/Logo.png"
            alt="BERNSTEIN"
            className="h-8 w-auto select-none"
            draggable={false}
          />
          <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">
            BERNSTEIN
          </span>
        </div>
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {projectIds.length > 1 && showProjectDropdown && (
            <select
              value={activeProjectId}
              onChange={(e) => onProjectChange(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
            >
              {projectIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          )}

          <Notification onProjectSwitch={onProjectChange} />

          <div className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-gray-700">
            <span
              className={`w-2 h-2 rounded-full ${
                isAdmin ? "bg-amber-500" : "bg-green-500"
              }`}
            />
            <span className="text-xs text-gray-500 hidden md:inline">
              {isAdmin ? "Admin" : email || "Local"}
            </span>
            <button
              onClick={onSignOut}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-1"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
