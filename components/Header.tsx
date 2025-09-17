
import React from 'react';
import type { User } from '../types';
import { ICONS } from '../constants';

interface HeaderProps {
    activeView: 'opportunities' | 'tasks';
    onNavigate: (view: 'opportunities' | 'tasks') => void;
    users: User[];
    currentUser: User | null;
    onSwitchUser: (user: User) => void;
}

const Header: React.FC<HeaderProps> = ({ activeView, onNavigate, users, currentUser, onSwitchUser }) => {
  const navButtonBaseClasses = "px-4 py-2 rounded-md text-sm font-semibold flex items-center space-x-2 transition-colors duration-200";
  const activeClasses = "bg-indigo-600 text-white shadow";
  const inactiveClasses = "bg-white text-slate-600 hover:bg-slate-100";

  const handleUserChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedUserId = event.target.value;
      const selectedUser = users.find(u => u.user_id === selectedUserId);
      if (selectedUser) {
          onSwitchUser(selectedUser);
      }
  };

  return (
    <header className="bg-white shadow-md sticky top-0 z-20">
      <div className="container mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <svg className="h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">
            Fivetran Services Opportunity Tracker
          </h1>
        </div>
        
        <div className="flex items-center space-x-4">
            <nav className="flex items-center space-x-2 p-1 bg-slate-200 rounded-lg">
               <button 
                    onClick={() => onNavigate('opportunities')}
                    className={`${navButtonBaseClasses} ${activeView === 'opportunities' ? activeClasses : inactiveClasses}`}
                    aria-current={activeView === 'opportunities' ? 'page' : undefined}
                >
                    {ICONS.briefcaseNav}
                    <span>Opportunities</span>
                </button>
                <button 
                    onClick={() => onNavigate('tasks')}
                    className={`${navButtonBaseClasses} ${activeView === 'tasks' ? activeClasses : inactiveClasses}`}
                    aria-current={activeView === 'tasks' ? 'page' : undefined}
                >
                    {ICONS.listBullet}
                    <span>My Tasks</span>
                </button>
            </nav>

            {/* User Switcher */}
            {currentUser && (
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-slate-500">Viewing as:</span>
                    <select
                        value={currentUser.user_id}
                        onChange={handleUserChange}
                        className="p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm font-semibold"
                        aria-label="Switch user"
                    >
                        {users.map(user => (
                            <option key={user.user_id} value={user.user_id}>
                                {user.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
      </div>
    </header>
  );
};

export default Header;
