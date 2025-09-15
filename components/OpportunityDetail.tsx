import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { Opportunity, AccountDetails, SupportTicket, UsageData, ProjectHistory, Disposition } from '../types';
import Card from './Card';
import Tag from './Tag';
import DispositionForm from './DispositionForm';
import { ICONS } from '../constants';

interface OpportunityDetailProps {
  opportunity: Opportunity;
  details: AccountDetails;
  historicalOpportunities: Opportunity[];
  onBack: () => void;
  onSave: (disposition: Disposition) => void;
}

const SECTIONS = [
    { id: 'usage-history', label: 'Usage', icon: ICONS.table },
    { id: 'support-summary', label: 'Support', icon: ICONS.ticket },
    { id: 'historical-opps', label: 'Opp History', icon: ICONS.history },
    { id: 'past-projects', label: 'Services', icon: ICONS.briefcase },
    { id: 'disposition', label: 'Disposition', icon: ICONS.clipboard },
];

const formatCurrency = (amount: number) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    // Replace hyphens with slashes to ensure the date is parsed in the browser's local timezone.
    // This avoids the common issue where 'YYYY-MM-DD' is treated as UTC midnight and can
    // roll back to the previous day when displayed in timezones west of UTC.
    // .split('T')[0] handles full ISO strings as well.
    const localDate = new Date(dateString.split('T')[0].replace(/-/g, '/'));
    if (isNaN(localDate.getTime())) {
        return 'Invalid Date';
    }
    return localDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

// --- Helper for rendering multi-value fields as tags ---
const renderMultiValueTags = (value: string | null | undefined) => {
    if (!value) return <span className="text-slate-400">N/A</span>;
    
    // Split by comma or semicolon, then trim and filter empty strings
    const items = value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (items.length === 0) return <span className="text-slate-400">N/A</span>;

    return (
        <div className="flex flex-wrap gap-1">
            {items.map((item, index) => (
                <span key={index} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full">
                    {item}
                </span>
            ))}
        </div>
    );
};


// --- Sub-components defined outside the main component for performance ---

const SupportTickets: React.FC<{ tickets: SupportTicket[] }> = ({ tickets }) => {
    const sortedTickets = useMemo(() => {
        return [...tickets].sort((a, b) => new Date(b.tickets_created_date).getTime() - new Date(a.tickets_created_date).getTime());
    }, [tickets]);

    if (tickets.length === 0) {
        return <p className="text-slate-500 text-sm">No open support tickets.</p>;
    }
    
    return (
        <div className="overflow-auto max-h-96">
            <table className="w-full text-xs text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-2 py-1">Created Date</th>
                        <th className="px-2 py-1">Status</th>
                        <th className="px-2 py-1">Subject</th>
                        <th className="px-2 py-1 text-center">Days Open</th>
                        <th className="px-2 py-1">Priority</th>
                        <th className="px-2 py-1 text-center">Escalated</th>
                        <th className="px-2 py-1 text-center">Days Since Response</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {sortedTickets.map(ticket => (
                        <tr key={ticket.tickets_ticket_number} className="hover:bg-slate-50">
                            <td className="px-2 py-1 whitespace-nowrap">{formatDate(ticket.tickets_created_date)}</td>
                            <td className="px-2 py-1"><Tag status={ticket.tickets_status} /></td>
                            <td className="px-2 py-1 font-medium">
                                <a href={ticket.tickets_ticket_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                                    {ticket.tickets_subject}
                                </a>
                            </td>
                            <td className="px-2 py-1 text-center">{ticket.days_open}</td>
                            <td className="px-2 py-1"><Tag status={ticket.tickets_priority} /></td>
                            <td className="px-2 py-1 text-center"><Tag status={ticket.tickets_is_escalated} /></td>
                            <td className="px-2 py-1 text-center">{ticket.days_since_last_responce}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


const UsageHistoryTable: React.FC<{ usage: UsageData[] }> = ({ usage }) => {
    const { pivotedData, months } = useMemo(() => {
        if (!usage || usage.length === 0) {
            return { pivotedData: [], months: [] };
        }

        const uniqueMonths = [...new Set(usage.map(u => u.month))].sort();
        const monthStrings = uniqueMonths.slice(-3);

        type PivotedRow = {
            service: string;
            monthlyData: {
                [month: string]: { revenue: number; connections: number; }
            }
        };

        const groupedData = usage.reduce((acc, item) => {
            const key = item.service;
            if (!acc[key]) {
                acc[key] = { service: key, monthlyData: {} };
            }
            if (monthStrings.includes(item.month)) {
                acc[key].monthlyData[item.month] = { 
                    revenue: item.annualized_revenue,
                    connections: item.connections_count,
                };
            }
            return acc;
        }, {} as Record<string, PivotedRow>);
        
        const pivotedArray = Object.values(groupedData);

        // Sort by the ARR in the most recent month with full data.
        const currentMonthStr = new Date().toISOString().slice(0, 7);
        let sortMonth: string | undefined;

        if (monthStrings.length > 0) {
            const latestMonth = monthStrings[monthStrings.length - 1];
            if (latestMonth === currentMonthStr && monthStrings.length > 1) {
                // If the latest month is the current (partial) month, use the previous one for sorting.
                sortMonth = monthStrings[monthStrings.length - 2];
            } else {
                // Otherwise, use the latest available month. This covers cases where the latest month
                // is a full month, or if it's the only month of data available.
                sortMonth = latestMonth;
            }
        }
        
        if (sortMonth) {
            pivotedArray.sort((a, b) => {
                const revenueA = a.monthlyData[sortMonth]?.revenue || 0;
                const revenueB = b.monthlyData[sortMonth]?.revenue || 0;
                return revenueB - revenueA;
            });
        }
        
        return { pivotedData: pivotedArray, months: monthStrings };

    }, [usage]);

    const formatRevenue = (revenue?: number) => {
        if (revenue === undefined || revenue === null) return '-';
        return formatCurrency(revenue);
    };

    const formatConnections = (connections?: number) => {
        if (connections === undefined || connections === null || connections === 0) return '-';
        return connections.toLocaleString();
    };


    if (pivotedData.length === 0) {
        return <p className="text-slate-500 text-sm">No usage history available for this period.</p>;
    }

    return (
        <div className="overflow-auto max-h-96">
            <table className="w-full text-xs text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0 z-10">
                    <tr>
                        <th rowSpan={2} className="px-2 py-2 border-b border-slate-300 align-bottom sticky left-0 bg-slate-50 z-20">Service</th>
                        {months.map(month => (
                            <th key={month} colSpan={2} className="px-2 py-1 text-center border-b border-l border-slate-300">
                                {month}
                            </th>
                        ))}
                    </tr>
                    <tr>
                        {months.map(month => (
                            <React.Fragment key={`${month}-sub`}>
                                <th className="px-2 py-1 text-right font-normal normal-case border-b border-l border-slate-300">Model ARR</th>
                                <th className="px-2 py-1 text-center font-normal normal-case border-b border-l border-slate-300">Connections</th>
                            </React.Fragment>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {pivotedData.map(row => (
                        <tr key={row.service} className="hover:bg-slate-50">
                            <td className="px-2 py-1 font-medium text-slate-800 truncate sticky left-0 bg-white hover:bg-slate-50" title={row.service}>{row.service}</td>
                             {months.map(month => (
                                <React.Fragment key={`${month}-${row.service}`}>
                                    <td className="px-2 py-1 text-right border-l font-semibold text-indigo-700">
                                        {formatRevenue(row.monthlyData[month]?.revenue)}
                                    </td>
                                    <td className="px-2 py-1 text-center border-l font-semibold text-slate-700">
                                        {formatConnections(row.monthlyData[month]?.connections)}
                                    </td>
                                </React.Fragment>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const ProjectHistoryList: React.FC<{ projects: ProjectHistory[] }> = ({ projects }) => {
    if (projects.length === 0) {
        return <p className="text-slate-500 text-sm">No prior services projects.</p>;
    }

    const renderProgressBar = (project: ProjectHistory) => {
        const remaining = project.opportunities_remaining_billable_hours;
        const budgeted = project.opportunities_budgeted_hours;
        const percentageRemaining = budgeted > 0 ? (remaining / budgeted) * 100 : 0;
        
        let barColor = 'bg-green-500';
        if (percentageRemaining < 25) barColor = 'bg-red-500';
        else if (percentageRemaining < 50) barColor = 'bg-yellow-500';

        return (
            <div className="w-full">
                <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600">{percentageRemaining.toFixed(0)}% Remaining</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                        className={`${barColor} h-2 rounded-full`} 
                        style={{ width: `${Math.min(percentageRemaining, 100)}%` }}
                    ></div>
                </div>
            </div>
        );
    };

    return (
        <div className="overflow-auto max-h-72">
            <table className="w-full text-xs text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-2 py-1">Opp Name</th>
                        <th className="px-2 py-1">Owner</th>
                        <th className="px-2 py-1">Due Date</th>
                        <th className="px-2 py-1 text-center">Budgeted</th>
                        <th className="px-2 py-1 text-center">Billable</th>
                        <th className="px-2 py-1 text-center">Remaining</th>
                        <th className="px-2 py-1 text-center">Non-Billable</th>
                        <th className="px-2 py-1 min-w-[120px]">% Hours Remaining</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {projects.map(proj => (
                        <tr key={proj.opportunities_id} className="hover:bg-slate-50">
                            <td className="px-2 py-1 font-medium text-slate-800" title={proj.opportunities_name}>{proj.opportunities_name}</td>
                            <td className="px-2 py-1 text-slate-500 truncate" title={proj.opportunities_project_owner_email}>{proj.opportunities_project_owner_email}</td>
                            <td className="px-2 py-1 whitespace-nowrap">{formatDate(proj.opportunities_rl_open_project_new_end_date)}</td>
                            <td className="px-2 py-1 text-center font-semibold">{proj.opportunities_budgeted_hours}</td>
                            <td className="px-2 py-1 text-center">{proj.opportunities_billable_hours}</td>
                            <td className="px-2 py-1 text-center font-bold text-indigo-700">{proj.opportunities_remaining_billable_hours}</td>
                            <td className="px-2 py-1 text-center text-red-600">{proj.opportunities_non_billable_hours}</td>
                            <td className="px-2 py-1">{renderProgressBar(proj)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const HistoricalOpportunitiesList: React.FC<{ opportunities: Opportunity[] }> = ({ opportunities }) => {
    const sortedOpps = useMemo(() => {
        // Sort by close date, descending
        return [...opportunities].sort((a, b) => 
            new Date(b.opportunities_close_date).getTime() - new Date(a.opportunities_close_date).getTime()
        );
    }, [opportunities]);

    if (opportunities.length === 0) {
        return <p className="text-slate-500 text-sm">No historical opportunities found.</p>;
    }

    return (
        <div className="overflow-auto max-h-96">
            <table className="w-full text-xs text-left table-fixed">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-2 py-1 w-[20%]">Opp Name</th>
                        <th className="px-2 py-1 w-[10%]">Owner</th>
                        <th className="px-2 py-1 w-[12%]">Stage</th>
                        <th className="px-2 py-1 text-right w-[8%]">Amount</th>
                        <th className="px-2 py-1 text-right w-[10%]">Incr. Bookings</th>
                        <th className="px-2 py-1 text-center w-[10%]">Services Attached</th>
                        <th className="px-2 py-1 w-[8%]">Type</th>
                        <th className="px-2 py-1 w-[10%]">Close Date</th>
                        <th className="px-2 py-1 w-[15%]">Connectors</th>
                        <th className="px-2 py-1 w-[8%]">Sizes</th>
                        <th className="px-2 py-1 w-[10%]">Destinations</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {sortedOpps.map(opp => (
                        <tr key={opp.opportunities_id} className="hover:bg-slate-50">
                            <td className="px-2 py-1 font-medium text-slate-800 truncate" title={opp.opportunities_name}>{opp.opportunities_name}</td>
                            <td className="px-2 py-1 truncate" title={opp.opportunities_owner_name}>{opp.opportunities_owner_name}</td>
                            <td className="px-2 py-1 truncate" title={opp.opportunities_stage_name}><Tag status={opp.opportunities_stage_name} /></td>
                            <td className="px-2 py-1 text-right font-semibold whitespace-nowrap">{formatCurrency(opp.opportunities_amount)}</td>
                            <td className="px-2 py-1 text-right whitespace-nowrap">{formatCurrency(opp.opportunities_incremental_bookings)}</td>
                            <td className="px-2 py-1 text-center"><Tag status={opp.opportunities_has_services_flag} /></td>
                            <td className="px-2 py-1 truncate" title={opp.opportunities_type}>{opp.opportunities_type}</td>
                            <td className="px-2 py-1 whitespace-nowrap">{formatDate(opp.opportunities_close_date)}</td>
                            <td className="px-2 py-1">{renderMultiValueTags(opp.opportunities_connectors)}</td>
                            <td className="px-2 py-1">{renderMultiValueTags(opp.opportunities_connector_tshirt_size_list)}</td>
                            <td className="px-2 py-1">{renderMultiValueTags(opp.opportunities_destinations)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


const OpportunityDetail: React.FC<OpportunityDetailProps> = ({ opportunity, details, historicalOpportunities, onBack, onSave }) => {
    const [activeSection, setActiveSection] = useState('usage-history');
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id);
                    }
                });
            },
            { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
        );

        const currentRefs = Object.values(sectionRefs.current);
        currentRefs.forEach(ref => {
            if (ref) observer.observe(ref);
        });

        return () => {
            currentRefs.forEach(ref => {
                if (ref) observer.unobserve(ref);
            });
        };
    }, []);

    const scrollToSection = (id: string) => {
        sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    
    // FIX: A TypeScript error was present because ref callbacks implicitly returned the element.
    // Wrapping the assignment in curly braces `{}` ensures a void return type, satisfying React's Ref type.
    const assignRef = (id: string) => (el: HTMLElement | null) => {
        sectionRefs.current[id] = el;
    };

    const lookerUrl = `https://fivetran.looker.com/dashboards/1328?Salesforce+Account+Name=&Salesforce+Account+ID=${opportunity.accounts_salesforce_account_id}&Fivetran+Account+ID=`;

    const usageHistoryTitle = (
        <a href={lookerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 group text-slate-700 hover:text-indigo-600 transition-colors">
            <span>Usage History (Last 3 Months)</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
        </a>
    );


    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <button onClick={onBack} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center mb-2">
                        {ICONS.arrowLeft}
                        <span className="ml-2">Back to List</span>
                    </button>
                    <h2 className="text-3xl font-bold text-slate-800">{opportunity.accounts_salesforce_account_name}</h2>
                    <p className="text-lg text-slate-600 mt-1">{opportunity.opportunities_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                    <div className="text-3xl font-bold text-green-700">{formatCurrency(opportunity.opportunities_amount)}</div>
                    <div className="text-sm text-slate-500">Total Opportunity Amount</div>
                </div>
            </div>

             {/* NEW Details Bar */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-8 flex flex-wrap items-center justify-start gap-x-8 gap-y-4 text-sm">
                <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-semibold">Stage:</span>
                    <Tag status={opportunity.opportunities_stage_name} />
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-semibold">Owner:</span>
                    <span className="text-slate-800 font-medium">{opportunity.opportunities_owner_name}</span>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-semibold">Close Date:</span>
                    <span className="text-slate-800 font-medium">{formatDate(opportunity.opportunities_close_date)}</span>
                </div>
                 <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-semibold">Sub End Date:</span>
                    <span className="text-slate-800 font-medium">{formatDate(opportunity.accounts_subscription_end_date)}</span>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-semibold">Services Amount:</span>
                    <span className="font-bold text-indigo-700">{formatCurrency(opportunity.opportunities_amount_services)}</span>
                </div>
            </div>


            {/* Main Content */}
            <div>
                <div className="sticky top-[70px] bg-slate-100 z-10 py-2">
                        <div className="flex items-center space-x-2 p-1 bg-slate-200 rounded-lg overflow-x-auto">
                        {SECTIONS.map(section => (
                            <button
                                key={section.id}
                                onClick={() => scrollToSection(section.id)}
                                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center space-x-2 whitespace-nowrap ${activeSection === section.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:bg-slate-300'}`}
                            >
                                {section.icon}
                                <span>{section.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="mt-4 space-y-8">
                    <div id="usage-history" ref={assignRef('usage-history')}>
                        <Card title={usageHistoryTitle} icon={ICONS.table}>
                            <UsageHistoryTable usage={details.usageHistory} />
                        </Card>
                    </div>
                    <div id="support-summary" ref={assignRef('support-summary')}>
                            <Card title="Support Summary" icon={ICONS.ticket}>
                            <SupportTickets tickets={details.supportTickets} />
                        </Card>
                    </div>
                    <div id="historical-opps" ref={assignRef('historical-opps')}>
                            <Card title="Opportunity History" icon={ICONS.history}>
                            <HistoricalOpportunitiesList opportunities={historicalOpportunities} />
                        </Card>
                    </div>
                    <div id="past-projects" ref={assignRef('past-projects')}>
                            <Card title="Services History" icon={ICONS.briefcase}>
                            <ProjectHistoryList projects={details.projectHistory} />
                        </Card>
                    </div>
                        <div id="disposition" ref={assignRef('disposition')}>
                        <DispositionForm
                            onSave={onSave}
                            opportunity={opportunity}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OpportunityDetail;