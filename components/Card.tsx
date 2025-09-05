
import React from 'react';

interface CardProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ title, children, icon }) => {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center space-x-3">
        {icon && <div className="text-indigo-600">{icon}</div>}
        <h3 className="text-lg font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
};

export default Card;
