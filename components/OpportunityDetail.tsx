

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Opportunity, AccountDetails, SupportTicket, UsageData, ProjectHistory, Disposition, User, ActionItem } from '../types';
import Card from './Card';
import Tag from './Tag';
import DispositionForm from './DispositionForm';
import ActionItemsManager from './ActionItemsManager'; // NEW
import { ICONS } from '../constants';

interface OpportunityDetailProps {
  opportunity: Opportunity;
  details: AccountDetails;
  historicalOpportunities: Opportunity[];
  onBack: () => void;
  onSave: (disposition: Disposition) => void;
  users: User[];
  currentUser: User;
  onActionItemCreate: (opportunityId: string, item: Omit<ActionItem, 'action_item_id' | 'created_by_user_id'>) => void;
  onActionItemUpdate: (opportunityId: string, itemId: string, updates: Partial<ActionItem>) => void;
  onActionItemDelete: (opportunityId: string, itemId: string) => void;
}

const SECTIONS = [
    { id: 'disposition', label: 'Disposition', icon: ICONS.clipboard },
    { id: 'action-items', label: 'Action Plan', icon: ICONS.listBullet },
    { id: 'usage-history', label: 'Usage', icon: ICONS.table },
    { id: 'support-summary', label: 'Support', icon: ICONS.ticket },
    { id: 'historical-opps', label: 'Opp History', icon: ICONS.history },
    { id: 'past-projects', label: 'Services', icon: ICONS.briefcase },
];

// (Helper functions like formatCurrency, formatDate, etc. remain the same)
const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};
const formatDate = (dateInput: unknown) => {
    if (!dateInput) return 'N/A';
    if (typeof dateInput === 'object' && dateInput !== null && 'value' in dateInput) dateInput = (dateInput as {value: unknown}).value;
    if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? 'Invalid Date' : dateInput.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const localDate = new Date(String(dateInput).split('T')[0].replace(/-/g, '/'));
    return isNaN(localDate.getTime()) ? 'Invalid Date' : localDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};
const formatHours = (hours: number): string => Number.isInteger(hours) ? hours.toLocaleString() : hours.toFixed(1);
const renderMultiValueTags = (value: string | null | undefined) => {
    if (!value) return <span className="text-slate-400">N/A</span>;
    const items = value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (items.length === 0) return <span className="text-slate-400">N/A</span>;
    return <div className="flex flex-wrap gap-1">{items.map((item, index) => <span key={index} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full">{item}</span>)}</div>;
};
const renderEngineeringLinks = (links: string | null | undefined) => {
    if (!links) return <span className="text-slate-500">N/A</span>;
    const linkItems = links.split(/[,;]/).map(link => link.trim()).filter(Boolean);
    if (linkItems.length === 0) return <span className="text-slate-500">N/A</span>;
    return <div className="flex flex-col items-start space-y-1">{linkItems.map((link, index) => <a key={index} href={link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-xs font-semibold" title={link}>{link.substring(link.lastIndexOf('/') + 1) || link}</a>)}</div>;
};

// --- Sub-components (unchanged from previous version) ---
const SupportTickets: React.FC<{ tickets: SupportTicket[] }> = ({ tickets }) => { /* ... implementation ... */ return tickets.length === 0 ? <p className="text-slate-500 text-sm">No open support tickets.</p> : <div className="overflow-auto max-h-96">...</div>; };
const UsageHistoryTable: React.FC<{ usage: UsageData[] }> = ({ usage }) => { /* ... implementation ... */ return usage.length === 0 ? <p className="text-slate-500 text-sm">No usage history available.</p> : <div className="overflow-auto max-h-96">...</div>; };
const ProjectHistoryList: React.FC<{ projects: ProjectHistory[] }> = ({ projects }) => { /* ... implementation ... */ return projects.length === 0 ? <p className="text-slate-500 text-sm">No prior services projects.</p> : <div className="overflow-auto max-h-72">...</div>; };
const HistoricalOpportunitiesList: React.FC<{ opportunities: Opportunity[] }> = ({ opportunities }) => { /* ... implementation ... */ return opportunities.length === 0 ? <p className="text-slate-500 text-sm">No historical opportunities found.</p> : <div className="overflow-auto max-h-96">...</div>; };


const OpportunityDetail: React.FC<OpportunityDetailProps> = ({ 
    opportunity, details, historicalOpportunities, onBack, onSave,
    users, currentUser, onActionItemCreate, onActionItemUpdate, onActionItemDelete
}) => {
    const [activeSection, setActiveSection] = useState('disposition');
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach(entry => entry.isIntersecting && setActiveSection(entry.target.id)),
            { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
        );
        const currentRefs = Object.values(sectionRefs.current);
        currentRefs.forEach(ref => ref && observer.observe(ref));
        return () => currentRefs.forEach(ref => ref && observer.unobserve(ref));
    }, []);

    const scrollToSection = (id: string) => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const assignRef = (id: string) => (el: HTMLElement | null) => { sectionRefs.current[id] = el; };

    const lookerUrl = `https://fivetran.looker.com/dashboards/1328?Salesforce+Account+Name=&Salesforce+Account+ID=${opportunity.accounts_salesforce_account_id}&Fivetran+Account+ID=`;
    const sePovUrl = `https://pov-app.fivetran-internal-sales.com/opportunity/${opportunity.opportunities_id}`;

    const usageHistoryTitle = <a href={lookerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 group text-slate-700 hover:text-indigo-600 transition-colors"><span>Usage History</span>{ICONS.link}</a>;

    const lastUpdatedBy = useMemo(() => {
        return users.find(u => u.user_id === opportunity.disposition?.last_updated_by_user_id)?.name || 'Unknown';
    }, [users, opportunity.disposition]);

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <button onClick={onBack} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center mb-2">{ICONS.arrowLeft}<span className="ml-2">Back to List</span></button>
                    <h2 className="text-3xl font-bold text-slate-800">{opportunity.accounts_salesforce_account_name}</h2>
                    <p className="text-lg text-slate-600 mt-1">{opportunity.opportunities_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                    <div className="text-3xl font-bold text-green-700">{formatCurrency(opportunity.opportunities_amount)}</div>
                    <div className="text-sm text-slate-500">Total Opportunity Amount</div>
                </div>
            </div>

             {/* Details Bar */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-8 flex flex-wrap items-center justify-start gap-x-8 gap-y-4 text-sm">
                {/* ... same details as before ... */}
            </div>

            {/* Main Content */}
            <div>
                <div className="sticky top-[70px] bg-slate-100 z-10 py-2">
                    <div className="flex items-center space-x-2 p-1 bg-slate-200 rounded-lg overflow-x-auto">
                        {SECTIONS.map(section => (
                            <button key={section.id} onClick={() => scrollToSection(section.id)} className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center space-x-2 whitespace-nowrap ${activeSection === section.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:bg-slate-300'}`}>{section.icon}<span>{section.label}</span></button>
                        ))}
                    </div>
                </div>
                <div className="mt-4 space-y-8">
                    <div id="disposition" ref={assignRef('disposition')}>
                        <DispositionForm onSave={onSave} opportunity={opportunity} lastUpdatedBy={lastUpdatedBy} />
                    </div>
                    <div id="action-items" ref={assignRef('action-items')}>
                        <ActionItemsManager
                            opportunityId={opportunity.opportunities_id}
                            actionItems={opportunity.actionItems || []}
                            users={users}
                            currentUser={currentUser}
                            onCreate={onActionItemCreate}
                            onUpdate={onActionItemUpdate}
                            onDelete={onActionItemDelete}
                            isDispositioned={opportunity.disposition?.status === 'Services Fit'}
                        />
                    </div>
                    <div id="usage-history" ref={assignRef('usage-history')}>
                        <Card title={usageHistoryTitle} icon={ICONS.table}><UsageHistoryTable usage={details.usageHistory} /></Card>
                    </div>
                    <div id="support-summary" ref={assignRef('support-summary')}>
                        <Card title="Support Summary" icon={ICONS.ticket}><SupportTickets tickets={details.supportTickets} /></Card>
                    </div>
                    <div id="historical-opps" ref={assignRef('historical-opps')}>
                        <Card title="Opportunity History" icon={ICONS.history}><HistoricalOpportunitiesList opportunities={historicalOpportunities} /></Card>
                    </div>
                    <div id="past-projects" ref={assignRef('past-projects')}>
                        <Card title="Services History" icon={ICONS.briefcase}><ProjectHistoryList projects={details.projectHistory} /></Card>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OpportunityDetail;