import React from 'react';

interface TagProps {
  status: string;
}

// Updated to include more generic and specific opportunity stages from the new schema
const statusColorMap: { [key: string]: string } = {
  // Opportunity Stages
  '0 - Created': 'bg-slate-100 text-slate-800',
  '1 - Contacted': 'bg-sky-100 text-sky-800',
  '2 - Why Stay?': 'bg-yellow-100 text-yellow-800',
  '3 - Selected': 'bg-blue-100 text-blue-800',
  '4 - Contract': 'bg-indigo-100 text-indigo-800',
  '5 - Closed': 'bg-green-100 text-green-800',
  'Pre-Sales Scoping': 'bg-orange-100 text-orange-800',
  'Engaged': 'bg-purple-100 text-purple-800',
  'Closed - Won': 'bg-green-100 text-green-800',
  'Closed - Lost': 'bg-slate-100 text-slate-800',
  'Yes': 'bg-red-100 text-red-800',
  'No': 'bg-gray-100 text-gray-800',
  
  // Ticket Statuses
  'Open': 'bg-green-100 text-green-800',
  'In Progress': 'bg-yellow-100 text-yellow-800',
  'Closed': 'bg-slate-100 text-slate-800',

  // Project Statuses
  'Completed': 'bg-blue-100 text-blue-800',

  // Ticket Priorities
  'High': 'bg-red-100 text-red-800',
  'Medium': 'bg-orange-100 text-orange-800',
  'Low': 'bg-gray-100 text-gray-800',
};

const Tag: React.FC<TagProps> = ({ status }) => {
  // Use a case-insensitive lookup
  const key = Object.keys(statusColorMap).find(k => k.toLowerCase() === status?.toLowerCase()) || status;
  const colorClass = statusColorMap[key] || 'bg-gray-100 text-gray-800';
  
  return (
    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${colorClass} whitespace-nowrap`}>
      {status}
    </span>
  );
};

export default Tag;