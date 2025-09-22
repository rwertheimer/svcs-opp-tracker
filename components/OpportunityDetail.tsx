import React, { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import type { Opportunity, AccountDetails, SupportTicket, UsageData, ProjectHistory, Disposition, User, ActionItem } from '../types';
import Card from './Card';
import Tag from './Tag';
import DispositionForm from './DispositionForm';
import ActionItemsManager from './ActionItemsManager';
import { ICONS } from '../constants';
import { DispositionActionPlanProvider, useDispositionActionPlan } from './disposition/DispositionActionPlanContext';
import SaveBar from './disposition/SaveBar';

interface OpportunityDetailProps {
  opportunity: Opportunity;
  details: AccountDetails;
  historicalOpportunities: Opportunity[];
  onBack: () => void;
  onSave: (disposition: Disposition) => Promise<void> | void;
  users: User[];
  currentUser: User;
  onActionItemCreate: (opportunityId: string, item: Omit<ActionItem, 'action_item_id' | 'created_by_user_id'>) => Promise<void> | void;
  onActionItemUpdate: (opportunityId: string, itemId: string, updates: Partial<ActionItem>) => Promise<void> | void;
  onActionItemDelete: (opportunityId: string, itemId: string) => Promise<void> | void;
  initialSectionId?: string;
}

type OpportunityDetailInnerProps = Omit<OpportunityDetailProps, 'onSave' | 'onActionItemCreate' | 'onActionItemUpdate' | 'onActionItemDelete' | 'currentUser'>;

const SECTIONS = [
    { id: 'usage-history', label: 'Usage', icon: ICONS.table },
    { id: 'support-summary', label: 'Support', icon: ICONS.ticket },
    { id: 'historical-opps', label: 'Opp History', icon: ICONS.history },
    { id: 'past-projects', label: 'Services', icon: ICONS.briefcase },
    { id: 'disposition', label: 'Disposition', icon: ICONS.clipboard },
];

const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const formatDate = (dateInput: unknown) => {
    if (!dateInput) return 'N/A';
    if (typeof dateInput === 'object' && dateInput !== null && 'value' in dateInput) {
        dateInput = (dateInput as {value: unknown}).value;
    }
    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return 'Invalid Date';
        return dateInput.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    const dateString = String(dateInput);
    const localDate = new Date(dateString.split('T')[0].replace(/-/g, '/'));
    if (isNaN(localDate.getTime())) return 'Invalid Date';
    return localDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatHours = (hours: number): string => {
    return Number.isInteger(hours) ? hours.toLocaleString() : hours.toFixed(1);
};

const renderMultiValueTags = (value: string | null | undefined) => {
    if (!value) return <span className="text-slate-400">N/A</span>;
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

const renderEngineeringLinks = (links: string | null | undefined) => {
    if (!links) return <span className="text-slate-500">N/A</span>;
    const linkItems = links.split(/[,;]/).map(link => link.trim()).filter(Boolean);
    if (linkItems.length === 0) return <span className="text-slate-500">N/A</span>;
    return (
        <div className="flex flex-col items-start space-y-1">
            {linkItems.map((link, index) => {
                const ticketId = link.substring(link.lastIndexOf('/') + 1);
                return (
                    <a
                        key={index}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline text-xs font-semibold"
                        title={link}
                    >
                        {ticketId || link}
                    </a>
                );
            })}
        </div>
    );
};

const SupportTickets: React.FC<{ tickets: SupportTicket[] }> = ({ tickets }) => {
    const sortedTickets = useMemo(() => {
        return [...tickets].sort((a, b) => new Date(b.tickets_created_date).getTime() - new Date(a.tickets_created_date).getTime());
    }, [tickets]);

    if (tickets.length === 0) {
        return <p className="text-slate-500 text-sm">No open support tickets.</p>;
    }

    const renderCsatScore = (score: number | null | undefined) => {
        if (score === null || score === undefined) return <span className="text-slate-400">-</span>;
        let color = 'text-slate-700';
        if (score <= 2) color = 'text-red-600';
        else if (score === 3) color = 'text-yellow-600';
        else if (score >= 4) color = 'text-green-600';
        return <span className={`font-bold text-center block ${color}`}>{score}/5</span>;
    };

    return (
        <div className="overflow-auto max-h-96">
            <table className="w-full text-xs text-left">
                <thead className="text-xs text-slate-600 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-2 py-1">Created Date</th>
                        <th className="px-2 py-1">Status</th>
                        <th className="px-2 py-1 text-center">CSAT</th>
                        <th className="px-2 py-1">Subject</th>
                        <th className="px-2 py-1 text-center">Days Open</th>
                        <th className="px-2 py-1">Priority</th>
                        <th className="px-2 py-1 text-center">Escalated</th>
                        <th className="px-2 py-1 text-center">Days Since Response</th>
                        <th className="px-2 py-1">Engineering Links</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {sortedTickets.map(ticket => (
                        <tr key={ticket.tickets_ticket_number} className="hover:bg-slate-50">
                            <td className="px-2 py-1 whitespace-nowrap">{formatDate(ticket.tickets_created_date)}</td>
                            <td className="px-2 py-1"><Tag status={ticket.tickets_status} /></td>
                            <td className="px-2 py-1 text-center">{renderCsatScore(ticket.tickets_new_csat_numeric)}</td>
                            <td className="px-2 py-1 font-medium">
                                <a href={ticket.tickets_ticket_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                                    {ticket.tickets_subject}
                                </a>
                            </td>
                            <td className="px-2 py-1 text-center">{ticket.days_open}</td>
                            <td className="px-2 py-1"><Tag status={ticket.tickets_priority} /></td>
                            <td className="px-2 py-1 text-center"><Tag status={ticket.tickets_is_escalated} /></td>
                            <td className="px-2 py-1 text-center">{ticket.days_since_last_response}</td>
                            <td className="px-2 py-1">{renderEngineeringLinks(ticket.tickets_engineering_issue_links_c)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// --- Support Summary (computed tiles) ---
const SupportSummaryTiles: React.FC<{ tickets: SupportTicket[] }> = ({ tickets }) => {
    const stats = useMemo(() => {
        const now = new Date();
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const toDate = (val: any) => {
            // Handle BigQuery-like objects { value: 'YYYY-MM-DD' } or plain strings
            let raw = val;
            if (raw && typeof raw === 'object' && 'value' in raw) raw = (raw as any).value;
            const str = String(raw);
            const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (m) {
                // Avoid timezone parsing issues by constructing via Y,M,D
                return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            }
            // Fallback
            return new Date(str);
        };
        const isOpenStatus = (status: string) => {
            const s = (status || '').toLowerCase();
            return !(s.includes('closed') || s.includes('resolved') || s.includes('solved') || s.includes('done'));
        };

        const last6 = tickets.filter(t => {
            const d = toDate((t as any).tickets_created_date);
            return !isNaN(d.getTime()) && d >= sixMonthsAgo;
        });

        const openCount = tickets.reduce((acc, t) => acc + (isOpenStatus(t.tickets_status) ? 1 : 0), 0);
        const total6 = last6.length;
        const avgPerMonth = +(total6 / 6).toFixed(1);
        const escalated6 = last6.reduce((acc, t) => acc + (t.tickets_is_escalated === 'Yes' ? 1 : 0), 0);

        const normPriority = (p: string | null | undefined) => {
            const s = (p || '').toLowerCase();
            if (s.includes('urgent') || s.includes('critical')) return 'Urgent';
            if (s.includes('high')) return 'High';
            if (s.includes('normal') || s.includes('medium')) return 'Normal';
            if (s.includes('low')) return 'Low';
            return 'Other';
        };

        const priorityBuckets: Record<string, number> = { Urgent: 0, High: 0, Normal: 0, Low: 0 };
        last6.forEach(t => {
            const b = normPriority(t.tickets_priority);
            if (b in priorityBuckets) priorityBuckets[b]++;
        });

        return { openCount, total6, avgPerMonth, escalated6, priorityBuckets };
    }, [tickets]);

    return (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <p className="text-xs text-slate-500 font-semibold">Open Tickets</p>
                <p className="text-xl font-bold text-indigo-700 mt-1">{stats.openCount}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <p className="text-xs text-slate-500 font-semibold">Last 6 Months</p>
                <p className="text-sm text-slate-700 mt-1">Total: <span className="font-bold">{stats.total6}</span></p>
                <p className="text-sm text-slate-700">Avg / month: <span className="font-bold">{stats.avgPerMonth}</span></p>
            </div>
            <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <p className="text-xs text-slate-500 font-semibold">Escalated (Last 6m)</p>
                <p className="text-xl font-bold text-indigo-700 mt-1">{stats.escalated6}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <p className="text-xs text-slate-500 font-semibold">Priority (Last 6m)</p>
                <p className="text-xs text-slate-700 mt-1">Urgent: <span className="font-bold">{stats.priorityBuckets.Urgent}</span> &nbsp; High: <span className="font-bold">{stats.priorityBuckets.High}</span></p>
                <p className="text-xs text-slate-700">Normal: <span className="font-bold">{stats.priorityBuckets.Normal}</span> &nbsp; Low: <span className="font-bold">{stats.priorityBuckets.Low}</span></p>
            </div>
        </div>
    );
};

// --- Opportunity History Summary ---
const HistorySummaryTiles: React.FC<{ opportunities: Opportunity[] }> = ({ opportunities }) => {
    const stats = useMemo(() => {
        const parseDate = (s: string) => new Date(String(s).split('T')[0].replace(/-/g, '/'));
        const isWon = (stage: string | null | undefined) => {
            const s = (stage || '').toLowerCase();
            // Loosen condition: treat any stage containing "closed" OR "won" as won/closed
            // (e.g., "Closed Won", "Won", "Closed")
            return s.includes('closed') || s.includes('won');
        };
        const won = opportunities
            // Exclude expansions (typically $0) from lifetime/tenure calcs
            .filter(o => !((o.opportunities_type || '').toLowerCase().includes('expansion'))) 
            .filter(o => isWon(o.opportunities_stage_name))
            .map(o => ({ amount: Number(o.opportunities_amount) || 0, close: parseDate(o.opportunities_close_date) }))
            .filter(x => !isNaN(x.close.getTime()))
            .sort((a, b) => a.close.getTime() - b.close.getTime());

        const lifetimeValue = won.reduce((acc, w) => acc + w.amount, 0);

        let yearsAsCustomer = 0;
        if (won.length > 0) {
            const segments: { start: Date; end: Date }[] = [];
            let segStart = won[0].close;
            let last = won[0].close;
            for (let i = 1; i < won.length; i++) {
                const d = won[i].close;
                const diffDays = (d.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
                if (diffDays > 365) {
                    segments.push({ start: segStart, end: last });
                    segStart = d;
                }
                last = d;
            }
            segments.push({ start: segStart, end: new Date() });

            const latest = segments[segments.length - 1];
            yearsAsCustomer = Math.max(0, (latest.end.getTime() - latest.start.getTime()) / (1000 * 60 * 60 * 24 * 365));
        }

        return { lifetimeValue, yearsAsCustomer: Number(yearsAsCustomer.toFixed(1)) };
    }, [opportunities]);

    return (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <p className="text-xs text-slate-500 font-semibold">Total Years as Customer</p>
                <p className="text-xl font-bold text-indigo-700 mt-1">{stats.yearsAsCustomer.toFixed(1)}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <p className="text-xs text-slate-500 font-semibold">Lifetime Value</p>
                <p className="text-xl font-bold text-indigo-700 mt-1">{formatCurrency(stats.lifetimeValue)}</p>
            </div>
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
            warehouse_subtype: string;
            monthlyData: {
                [month: string]: { revenue: number; connections: number; }
            }
        };

        const groupedData = usage.reduce((acc, item) => {
            const key = `${item.service}::${item.warehouse_subtype || 'N/A'}`;
            if (!acc[key]) {
                acc[key] = { service: item.service, warehouse_subtype: item.warehouse_subtype || 'N/A', monthlyData: {} };
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

        const currentMonthStr = new Date().toISOString().slice(0, 7);
        let sortMonth: string | undefined;

        if (monthStrings.length > 0) {
            const latestMonth = monthStrings[monthStrings.length - 1];
            if (latestMonth === currentMonthStr && monthStrings.length > 1) {
                sortMonth = monthStrings[monthStrings.length - 2];
            } else {
                sortMonth = latestMonth;
            }
        }
        
        if (sortMonth) {
            pivotedArray.sort((a, b) => {
                const revenueA = a.monthlyData[sortMonth!]?.revenue || 0;
                const revenueB = b.monthlyData[sortMonth!]?.revenue || 0;
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
                        <th rowSpan={2} className="px-2 py-2 border-b border-slate-300 align-bottom sticky left-0 bg-slate-50 z-20 w-32">Service</th>
                        <th rowSpan={2} className="px-2 py-2 border-b border-slate-300 align-bottom sticky left-32 bg-slate-50 z-20 w-32">Warehouse</th>
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
                        <tr key={row.service + row.warehouse_subtype} className="hover:bg-slate-50">
                            <td className="px-2 py-1 font-medium text-slate-800 truncate sticky left-0 bg-white hover:bg-slate-50 w-32" title={row.service}>{row.service}</td>
                            <td className="px-2 py-1 text-slate-700 truncate sticky left-32 bg-white hover:bg-slate-50 w-32" title={row.warehouse_subtype}>{row.warehouse_subtype}</td>
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
                        <th className="px-2 py-1">Project Name</th>
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
                            <td className="px-2 py-1 font-medium" title={proj.opportunities_name}>
                                <a href={`https://fivetranps.rocketlane.com/projects/${proj.opportunities_id}/overview`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                                    {proj.opportunities_name}
                                </a>
                            </td>
                            <td className="px-2 py-1 text-slate-500 truncate" title={proj.opportunities_project_owner_email}>{proj.opportunities_project_owner_email}</td>
                            <td className="px-2 py-1 whitespace-nowrap">{formatDate(proj.opportunities_rl_open_project_new_end_date)}</td>
                            <td className="px-2 py-1 text-center font-semibold">{formatHours(proj.opportunities_budgeted_hours)}</td>
                            <td className="px-2 py-1 text-center">{formatHours(proj.opportunities_billable_hours)}</td>
                            <td className="px-2 py-1 text-center font-bold text-indigo-700">{formatHours(proj.opportunities_remaining_billable_hours)}</td>
                            <td className="px-2 py-1 text-center text-red-600">{formatHours(proj.opportunities_non_billable_hours)}</td>
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
                            <td className="px-2 py-1 font-medium text-slate-800 truncate" title={opp.opportunities_name}>
                                <a href={`https://fivetran.lightning.force.com/lightning/r/Opportunity/${opp.opportunities_id}/view`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                                    {opp.opportunities_name}
                                </a>
                            </td>
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

const OpportunityDetailInner: React.FC<OpportunityDetailInnerProps> = ({ opportunity, details, historicalOpportunities, onBack, users, initialSectionId }) => {
    const [activeSection, setActiveSection] = useState(initialSectionId || 'usage-history');
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const { confirmDiscardChanges, draftDisposition, changeDispositionStatus, updateDisposition } = useDispositionActionPlan();

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

    // TODO(UX): Scroll anchoring remains inconsistent in some environments.
    // - StrictMode double-mount + async detail loading can delay ref attachment
    // - Sticky header offset varies with viewport / zoom
    // - Hash + programmatic scrolling not always honored on first paint
    // Future: consider a router-level anchor strategy or an observer that
    // scrolls once both refs and data are confirmed ready.
    const scrollToSection = useCallback((id: string) => {
        if (id !== 'disposition' && !confirmDiscardChanges()) {
            return;
        }
        const el = sectionRefs.current[id];
        if (!el) return;
        const headerOffset = 90; // sticky header + padding
        const rect = el.getBoundingClientRect();
        const absoluteTop = rect.top + window.scrollY - headerOffset;
        window.scrollTo({ top: absoluteTop, behavior: 'smooth' });
    }, [confirmDiscardChanges]);
    
    const assignRef = (id: string) => (el: HTMLElement | null) => {
        sectionRefs.current[id] = el;
    };

    const lookerUrl = `https://fivetran.looker.com/dashboards/1328?Salesforce+Account+Name=&Salesforce+Account+ID=${opportunity.accounts_salesforce_account_id}&Fivetran+Account+ID=`;
    const sePovUrl = `https://pov-app.fivetran-internal-sales.com/opportunity/${opportunity.opportunities_id}`;

    const usageHistoryTitle = (
        <a href={lookerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 group text-slate-700 hover:text-indigo-600 transition-colors">
            <span>Usage History (Last 3 Months)</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
        </a>
    );

    // NOTE(UX): Initial auto-scroll is still not 100% reliable; leaving this
    // retry logic as a best-effort and will revisit with a routing anchor or
    // layout-ready signal.
    useLayoutEffect(() => {
        const targetId = initialSectionId || (typeof window !== 'undefined' ? window.location.hash?.slice(1) : undefined);
        if (!targetId) return;
        let cancelled = false;
        let attempts = 0;
        const tryScroll = () => {
            if (cancelled) return;
            const el = sectionRefs.current[targetId!];
            if (el) {
                scrollToSection(targetId!);
                setActiveSection(targetId!);
            } else if (attempts < 10) {
                attempts += 1;
                setTimeout(tryScroll, 50);
            }
        };
        // Kick off on next frame so layout is ready
        requestAnimationFrame(tryScroll);
        return () => { cancelled = true; };
    }, [initialSectionId, opportunity.opportunities_id, scrollToSection]);

    const lastUpdatedByName = useMemo(() => {
        const id = opportunity.disposition?.last_updated_by_user_id;
        const found = users?.find(u => u.user_id === id);
        return found ? found.name : undefined;
    }, [opportunity.disposition?.last_updated_by_user_id, users]);

    const handleBack = () => {
        if (!confirmDiscardChanges()) return;
        onBack();
    };

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <button onClick={handleBack} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center mb-2">
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

            {/* Details Bar */}
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
                <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-semibold">Forecast Category:</span>
                    {opportunity.disposition?.forecast_category_override && opportunity.disposition.forecast_category_override !== opportunity.opportunities_forecast_category ? (
                         <div className="flex items-center space-x-1.5" title={`SA Adjusted Category. Original SFDC category was ${opportunity.opportunities_forecast_category}.`}>
                            <span className="font-semibold text-indigo-700">{opportunity.disposition.forecast_category_override}</span>
                            <span className="text-slate-400 line-through text-xs">{opportunity.opportunities_forecast_category}</span>
                            <span className="text-slate-400">{ICONS.pencil}</span>
                        </div>
                    ) : (
                        <span className="text-slate-800 font-medium">{opportunity.opportunities_forecast_category || 'N/A'}</span>
                    )}
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-semibold">Fivetran Status:</span>
                    <Tag status={opportunity.accounts_primary_fivetran_account_status} />
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-semibold">Quoted Products:</span>
                    <span className="text-slate-800 font-medium">{opportunity.opportunities_quoted_products || 'N/A'}</span>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-semibold">Pitched Products:</span>
                    <span className="text-slate-800 font-medium">{opportunity.opportunities_product_being_pitched || 'N/A'}</span>
                </div>
                <a href={sePovUrl} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-1.5 text-indigo-600 hover:text-indigo-800 font-semibold transition-colors">
                    {ICONS.link}
                    <span>SE POV App</span>
                </a>
            </div>

            <SaveBar />

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
                    <div id="usage-history" ref={assignRef('usage-history')} style={{ scrollMarginTop: 90 }}>
                        <Card title={usageHistoryTitle} icon={ICONS.table}>
                            <UsageHistoryTable usage={details.usageHistory} />
                        </Card>
                    </div>
                    <div id="support-summary" ref={assignRef('support-summary')} style={{ scrollMarginTop: 90 }}>
                        <Card title="Support Summary" icon={ICONS.ticket}>
                            <SupportSummaryTiles tickets={details.supportTickets} />
                            <SupportTickets tickets={details.supportTickets} />
                        </Card>
                    </div>
                    <div id="historical-opps" ref={assignRef('historical-opps')} style={{ scrollMarginTop: 90 }}>
                        <Card title="Opportunity History" icon={ICONS.history}>
                            <HistorySummaryTiles opportunities={historicalOpportunities} />
                            <HistoricalOpportunitiesList opportunities={historicalOpportunities} />
                        </Card>
                    </div>
                    <div id="past-projects" ref={assignRef('past-projects')} style={{ scrollMarginTop: 90 }}>
                        <Card title="Services History" icon={ICONS.briefcase}>
                            <ProjectHistoryList projects={details.projectHistory} />
                        </Card>
                    </div>
                    <div id="disposition" ref={assignRef('disposition')} style={{ scrollMarginTop: 90 }}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <DispositionForm
                                opportunity={opportunity}
                                disposition={draftDisposition}
                                onStatusChange={changeDispositionStatus}
                                onDispositionChange={updateDisposition}
                                lastUpdatedBy={lastUpdatedByName}
                            />
                            <div id="action-items" style={{ scrollMarginTop: 90 }}>
                                <ActionItemsManager users={users} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OpportunityDetail: React.FC<OpportunityDetailProps> = ({
    opportunity,
    details,
    historicalOpportunities,
    onBack,
    onSave,
    users,
    currentUser,
    onActionItemCreate,
    onActionItemUpdate,
    onActionItemDelete,
    initialSectionId,
}) => {
    return (
        <DispositionActionPlanProvider
            opportunity={opportunity}
            currentUser={currentUser}
            onSaveDisposition={onSave}
            onActionItemCreate={onActionItemCreate}
            onActionItemUpdate={onActionItemUpdate}
            onActionItemDelete={onActionItemDelete}
        >
            <OpportunityDetailInner
                opportunity={opportunity}
                details={details}
                historicalOpportunities={historicalOpportunities}
                onBack={onBack}
                users={users}
                initialSectionId={initialSectionId}
            />
        </DispositionActionPlanProvider>
    );
};

export default OpportunityDetail;
