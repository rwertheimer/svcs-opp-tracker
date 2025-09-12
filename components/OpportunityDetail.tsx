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
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
};

const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    // Adjust for timezone to prevent date from shifting
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return utcDate.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-4 py-2">Created Date</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Subject</th>
                        <th className="px-4 py-2 text-center">Days Open</th>
                        <th className="px-4 py-2">Priority</th>
                        <th className="px-4 py-2 text-center">Escalated</th>
                        <th className="px-4 py-2 text-center">Days Since Response</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {sortedTickets.map(ticket => (
                        <tr key={ticket.tickets_ticket_number} className="hover:bg-slate-50">
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(ticket.tickets_created_date)}</td>
                            <td className="px-4 py-2"><Tag status={ticket.tickets_status} /></td>
                            <td className="px-4 py-2 font-medium">
                                <a href={ticket.tickets_ticket_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                                    {ticket.tickets_subject}
                                </a>
                            </td>
                            <td className="px-4 py-2 text-center">{ticket.days_open}</td>
                            <td className="px-4 py-2"><Tag status={ticket.tickets_priority} /></td>
                            <td className="px-4 py-2 text-center"><Tag status={ticket.tickets_is_escalated} /></td>
                            <td className="px-4 py-2 text-center">{ticket.days_since_last_responce}</td>
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

        // Get unique months, sort them ascending (chronologically), and take the last 3
        const uniqueMonths = [...new Set(usage.map(u => u.accounts_timeline_date_month))].sort();
        const monthStrings = uniqueMonths.slice(-3); 

        type PivotedRow = {
            key: string;
            tableName: string;
            groupName: string;
            warehouseType: string;
            service: string;
            monthlyData: {
                [month: string]: { raw: number; billable: number; }
            }
        };

        const groupedData = usage.reduce((acc, item) => {
            const key = [
                item.connections_table_timeline_table_name,
                item.connections_group_name,
                item.connections_warehouse_subtype,
                item.connections_timeline_service_eom
            ].join('|');

            if (!acc[key]) {
                acc[key] = {
                    key,
                    tableName: item.connections_table_timeline_table_name,
                    groupName: item.connections_group_name,
                    warehouseType: item.connections_warehouse_subtype,
                    service: item.connections_timeline_service_eom,
                    monthlyData: {}
                };
            }
            
            // Only include data for the selected months
            if (monthStrings.includes(item.accounts_timeline_date_month)) {
                acc[key].monthlyData[item.accounts_timeline_date_month] = {
                    raw: item.connections_table_timeline_raw_volume_updated,
                    billable: item.connections_table_timeline_total_billable_volume
                };
            }
            return acc;
        }, {} as Record<string, PivotedRow>);
        
        const pivotedArray = Object.values(groupedData);

        // Sort descending by the most recent month's raw volume to bring most active to top
        const mostRecentMonth = monthStrings[monthStrings.length - 1];
        pivotedArray.sort((a, b) => {
            const rawA = a.monthlyData[mostRecentMonth]?.raw || 0;
            const rawB = b.monthlyData[mostRecentMonth]?.raw || 0;
            return rawB - rawA;
        });

        return { pivotedData: pivotedArray, months: monthStrings };

    }, [usage]);

    const formatVolume = (volume: number) => {
        if (volume === 0) return '0';
        if (!volume) return '-';
        return volume.toLocaleString('en-US');
    }

    if (pivotedData.length === 0) {
        return <p className="text-slate-500 text-sm">No usage history available for this period.</p>;
    }

    return (
        <div className="overflow-auto max-h-96">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th rowSpan={2} className="px-4 py-2 border-b border-slate-300 align-bottom">Table Name</th>
                        <th rowSpan={2} className="px-4 py-2 border-b border-slate-300 align-bottom">Group Name</th>
                        <th rowSpan={2} className="px-4 py-2 border-b border-slate-300 align-bottom">Warehouse Type</th>
                        <th rowSpan={2} className="px-4 py-2 border-b border-slate-300 align-bottom">Service</th>
                        {months.map(month => (
                            <th key={month} colSpan={2} className="px-4 py-2 text-center border-b border-l border-slate-300">{month}</th>
                        ))}
                    </tr>
                    <tr>
                        {months.map(month => (
                            <React.Fragment key={month + '-sub'}>
                                <th className="px-4 py-2 text-right border-b border-l border-slate-300 font-normal">Raw Volume</th>
                                <th className="px-4 py-2 text-right border-b border-slate-300">Total Billable MAR</th>
                            </React.Fragment>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {pivotedData.map(row => (
                        <tr key={row.key} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-800">{row.tableName}</td>
                            <td className="px-4 py-2">{row.groupName}</td>
                            <td className="px-4 py-2"><Tag status={row.warehouseType} /></td>
                            <td className="px-4 py-2">{row.service}</td>
                             {months.map(month => (
                                <React.Fragment key={month + '-' + row.key}>
                                    <td className="px-4 py-2 text-right border-l">{formatVolume(row.monthlyData[month]?.raw)}</td>
                                    <td className="px-4 py-2 text-right font-semibold text-indigo-700">{formatVolume(row.monthlyData[month]?.billable)}</td>
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
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-4 py-2">Opp Name</th>
                        <th className="px-4 py-2">Owner</th>
                        <th className="px-4 py-2">Due Date</th>
                        <th className="px-4 py-2 text-center">Budgeted</th>
                        <th className="px-4 py-2 text-center">Billable</th>
                        <th className="px-4 py-2 text-center">Remaining</th>
                        <th className="px-4 py-2 text-center">Non-Billable</th>
                        <th className="px-4 py-2 min-w-[120px]">% Hours Remaining</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {projects.map(proj => (
                        <tr key={proj.opportunities_id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-800" title={proj.opportunities_name}>{proj.opportunities_name}</td>
                            <td className="px-4 py-2 text-xs text-slate-500 truncate" title={proj.opportunities_project_owner_email}>{proj.opportunities_project_owner_email}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(proj.opportunities_rl_open_project_new_end_date)}</td>
                            <td className="px-4 py-2 text-center font-semibold">{proj.opportunities_budgeted_hours}</td>
                            <td className="px-4 py-2 text-center">{proj.opportunities_billable_hours}</td>
                            <td className="px-4 py-2 text-center font-bold text-indigo-700">{proj.opportunities_remaining_billable_hours}</td>
                            <td className="px-4 py-2 text-center text-red-600">{proj.opportunities_non_billable_hours}</td>
                            <td className="px-4 py-2">{renderProgressBar(proj)}</td>
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
            <table className="w-full text-sm text-left table-fixed">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-4 py-2 w-[20%]">Opp Name</th>
                        <th className="px-4 py-2 w-[10%]">Owner</th>
                        <th className="px-4 py-2 w-[12%]">Stage</th>
                        <th className="px-4 py-2 text-right w-[8%]">Amount</th>
                        <th className="px-4 py-2 text-right w-[10%]">Incr. Bookings</th>
                        <th className="px-4 py-2 text-center w-[10%]">Services Attached</th>
                        <th className="px-4 py-2 w-[8%]">Type</th>
                        <th className="px-4 py-2 w-[10%]">Close Date</th>
                        <th className="px-4 py-2 w-[15%]">Connectors</th>
                        <th className="px-4 py-2 w-[8%]">Sizes</th>
                        <th className="px-4 py-2 w-[10%]">Destinations</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {sortedOpps.map(opp => (
                        <tr key={opp.opportunities_id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-800 truncate" title={opp.opportunities_name}>{opp.opportunities_name}</td>
                            <td className="px-4 py-2 truncate" title={opp.opportunities_owner_name}>{opp.opportunities_owner_name}</td>
                            <td className="px-4 py-2 truncate" title={opp.opportunities_stage_name}><Tag status={opp.opportunities_stage_name} /></td>
                            <td className="px-4 py-2 text-right font-semibold whitespace-nowrap">{formatCurrency(opp.opportunities_amount)}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">{formatCurrency(opp.opportunities_incremental_bookings)}</td>
                            <td className="px-4 py-2 text-center"><Tag status={opp.opportunities_has_services_flag} /></td>
                            <td className="px-4 py-2 truncate" title={opp.opportunities_type}>{opp.opportunities_type}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(opp.opportunities_close_date)}</td>
                            <td className="px-4 py-2">{renderMultiValueTags(opp.opportunities_connectors)}</td>
                            <td className="px-4 py-2">{renderMultiValueTags(opp.opportunities_connector_tshirt_size_list)}</td>
                            <td className="px-4 py-2">{renderMultiValueTags(opp.opportunities_destinations)}</td>
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


    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
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

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Left Side: Summary Cards */}
                <div className="lg:col-span-1 space-y-4">
                     <div className="p-4 bg-white rounded-lg shadow-md space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-slate-600">Stage</span>
                            <Tag status={opportunity.opportunities_stage_name} />
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-slate-600">Owner</span>
                            <span className="text-sm text-slate-800">{opportunity.opportunities_owner_name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-slate-600">Close Date</span>
                            <span className="text-sm text-slate-800">{formatDate(opportunity.opportunities_close_date)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-slate-600">Services Amount</span>
                            <span className="text-sm font-bold text-indigo-700">{formatCurrency(opportunity.opportunities_amount_services)}</span>
                        </div>
                         <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-slate-600">Sub End Date</span>
                            <span className="text-sm text-slate-800">{formatDate(opportunity.accounts_subscription_end_date)}</span>
                        </div>
                    </div>
                </div>

                {/* Right Side: Tabbed Sections */}
                <div className="lg:col-span-3">
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
                            <Card title="Usage History (Last 3 Months)" icon={ICONS.table}>
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
        </div>
    );
};

export default OpportunityDetail;
